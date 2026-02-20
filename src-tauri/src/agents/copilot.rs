use async_trait::async_trait;
use copilot_sdk::{Client, CustomAgentConfig, Session, SessionConfig, SessionEventData, SystemMessageConfig, SystemMessageMode, Tool};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::backend::{AgentBackend, AgentOption, BackendConfig, BackendMessage, BackendResponse, MessageRole, ModelOption};

struct AgentSession {
    session: Arc<Session>,
    idle_notify: Arc<tokio::sync::Notify>,
    collected: Arc<std::sync::Mutex<String>>,
}

pub struct CopilotBackend {
    client: Arc<RwLock<Option<Client>>>,
    /// Persistent sessions for awareness events, keyed by agent_id
    awareness_sessions: Arc<RwLock<HashMap<String, AgentSession>>>,
    /// Persistent sessions for user chat, keyed by agent_id
    chat_sessions: Arc<RwLock<HashMap<String, AgentSession>>>,
}

impl CopilotBackend {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            awareness_sessions: Arc::new(RwLock::new(HashMap::new())),
            chat_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn ensure_client(&self) -> Result<(), String> {
        let mut client_lock = self.client.write().await;
        if client_lock.is_none() {
            log::info!("Creating Copilot SDK client...");
            let client = Client::builder()
                .use_stdio(true)
                .build()
                .map_err(|e| {
                    log::error!("Failed to create Copilot client: {}", e);
                    format!("Failed to create Copilot client: {}", e)
                })?;
            client
                .start()
                .await
                .map_err(|e| {
                    log::error!("Failed to start Copilot client: {}", e);
                    format!("Failed to start Copilot client: {}", e)
                })?;
            log::info!("Copilot SDK client initialized");
            *client_lock = Some(client);
        }
        Ok(())
    }

    /// Get or create a persistent awareness session for an agent.
    async fn get_or_create_awareness_session(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        tools: &[Tool],
        tool_handlers: &[(String, Arc<dyn Fn(&str, &serde_json::Value) -> copilot_sdk::ToolResultObject + Send + Sync>)],
    ) -> Result<(), String> {
        // Check if session already exists
        {
            let sessions = self.awareness_sessions.read().await;
            if sessions.contains_key(agent_id) {
                // Update tool handlers (they capture fresh World state)
                let agent_session = sessions.get(agent_id).unwrap();
                for (name, handler) in tool_handlers {
                    agent_session.session
                        .register_tool_with_handler(Tool::new(name), Some(handler.clone()))
                        .await;
                }
                return Ok(());
            }
        }

        // Create new session
        self.ensure_client().await?;
        let client_lock = self.client.read().await;
        let client = client_lock.as_ref().unwrap();

        let mut session_config = SessionConfig {
            model: config.model.clone(),
            tools: tools.to_vec(),
            ..Default::default()
        };

        if let Some(ref prompt_text) = config.system_prompt {
            session_config.system_message = Some(SystemMessageConfig {
                mode: Some(SystemMessageMode::Replace),
                content: Some(prompt_text.clone()),
            });
        }

        if let Some(ref agent_name) = config.custom_agent {
            session_config.custom_agents = Some(vec![CustomAgentConfig {
                name: agent_name.clone(),
                prompt: config.system_prompt.clone().unwrap_or_default(),
                display_name: None,
                description: None,
                tools: None,
                mcp_servers: None,
                infer: Some(true),
            }]);
        }

        log::info!("Creating persistent awareness session for agent {}", agent_id);
        let session = client
            .create_session(session_config)
            .await
            .map_err(|e| format!("Failed to create session: {}", e))?;

        // Register tool handlers
        for (name, handler) in tool_handlers {
            session
                .register_tool_with_handler(Tool::new(name), Some(handler.clone()))
                .await;
        }

        // Set up event listener for this session
        let idle_notify = Arc::new(tokio::sync::Notify::new());
        let idle_clone = Arc::clone(&idle_notify);
        let collected = Arc::new(std::sync::Mutex::new(String::new()));
        let collected_clone = collected.clone();

        let _unsub = session
            .on(move |event| match &event.data {
                SessionEventData::AssistantMessage(msg) => {
                    collected_clone.lock().unwrap().push_str(&msg.content);
                }
                SessionEventData::AssistantMessageDelta(delta) => {
                    collected_clone.lock().unwrap().push_str(&delta.delta_content);
                }
                SessionEventData::ToolExecutionStart(start) => {
                    log::info!("[tool-call] {} args={}", start.tool_name,
                        start.arguments.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string()));
                }
                SessionEventData::ToolExecutionComplete(complete) => {
                    if let Some(ref result) = complete.result {
                        log::info!("[tool-result] {}", result.content);
                    }
                }
                SessionEventData::SessionIdle(_) => {
                    idle_clone.notify_one();
                }
                _ => {}
            })
            .await;

        let mut sessions = self.awareness_sessions.write().await;
        sessions.insert(agent_id.to_string(), AgentSession {
            session,
            idle_notify,
            collected,
        });

        Ok(())
    }

    /// Dispatch awareness events using a persistent tool-enabled session.
    pub async fn dispatch_with_tools(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        prompt: &str,
        tools: Vec<Tool>,
        tool_handlers: Vec<(String, Arc<dyn Fn(&str, &serde_json::Value) -> copilot_sdk::ToolResultObject + Send + Sync>)>,
    ) -> Result<String, String> {
        // Ensure session exists and handlers are current
        self.get_or_create_awareness_session(agent_id, config, &tools, &tool_handlers).await?;

        let sessions = self.awareness_sessions.read().await;
        let agent_session = sessions.get(agent_id).ok_or("Session not found")?;

        // Clear collected text from previous turn
        agent_session.collected.lock().unwrap().clear();

        // Send the prompt on the existing session
        agent_session.session.send(prompt).await.map_err(|e| {
            // If send fails, drop the session so it gets recreated next time
            log::warn!("Session send failed for {}, will recreate: {}", agent_id, e);
            format!("Send failed: {}", e)
        })?;

        // Wait for idle with timeout
        let timeout_result = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            agent_session.idle_notify.notified(),
        ).await;

        if timeout_result.is_err() {
            // Drop broken session so it gets recreated
            drop(sessions);
            self.awareness_sessions.write().await.remove(agent_id);
            return Err("Timed out waiting for response (15s)".to_string());
        }

        let result = agent_session.collected.lock().unwrap().clone();
        Ok(result)
    }

    /// Remove a persistent session (e.g. when agent is removed)
    pub async fn remove_session(&self, agent_id: &str) {
        let mut sessions = self.awareness_sessions.write().await;
        if let Some(agent_session) = sessions.remove(agent_id) {
            let _ = agent_session.session.destroy().await;
            log::info!("Destroyed awareness session for {}", agent_id);
        }
        drop(sessions);

        let mut chat_sessions = self.chat_sessions.write().await;
        if let Some(agent_session) = chat_sessions.remove(agent_id) {
            let _ = agent_session.session.destroy().await;
            log::info!("Destroyed chat session for {}", agent_id);
        }
    }
}

#[async_trait]
impl AgentBackend for CopilotBackend {
    fn id(&self) -> &str {
        "copilot"
    }

    fn display_name(&self) -> &str {
        "GitHub Copilot"
    }

    async fn respond(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String> {
        log::info!("Copilot respond: agent={}, model={:?}, custom_agent={:?}, {} messages",
            agent_id, config.model, config.custom_agent, messages.len());

        // Get or create a persistent chat session for this agent
        let need_create = {
            let sessions = self.chat_sessions.read().await;
            !sessions.contains_key(agent_id)
        };

        if need_create {
            self.ensure_client().await?;
            let client_lock = self.client.read().await;
            let client = client_lock.as_ref().unwrap();

            let mut session_config = SessionConfig {
                model: config.model.clone(),
                ..Default::default()
            };

            if let Some(ref prompt) = config.system_prompt {
                session_config.system_message = Some(SystemMessageConfig {
                    mode: Some(SystemMessageMode::Replace),
                    content: Some(prompt.clone()),
                });
            }

            if let Some(ref agent_name) = config.custom_agent {
                session_config.custom_agents = Some(vec![CustomAgentConfig {
                    name: agent_name.clone(),
                    prompt: config.system_prompt.clone().unwrap_or_default(),
                    display_name: None,
                    description: None,
                    tools: None,
                    mcp_servers: None,
                    infer: Some(true),
                }]);
            }

            log::info!("Creating persistent chat session for agent {}", agent_id);
            let session = client
                .create_session(session_config)
                .await
                .map_err(|e| format!("Failed to create session: {}", e))?;

            let idle_notify = Arc::new(tokio::sync::Notify::new());
            let idle_clone = Arc::clone(&idle_notify);
            let collected = Arc::new(std::sync::Mutex::new(String::new()));
            let collected_clone = collected.clone();

            let _unsub = session
                .on(move |event| match &event.data {
                    SessionEventData::AssistantMessage(msg) => {
                        collected_clone.lock().unwrap().push_str(&msg.content);
                    }
                    SessionEventData::AssistantMessageDelta(delta) => {
                        collected_clone.lock().unwrap().push_str(&delta.delta_content);
                    }
                    SessionEventData::SessionIdle(_) => {
                        idle_clone.notify_one();
                    }
                    _ => {}
                })
                .await;

            let mut sessions = self.chat_sessions.write().await;
            sessions.insert(agent_id.to_string(), AgentSession {
                session,
                idle_notify,
                collected,
            });
        }

        // Send only the latest user message on the persistent session
        let last_user_msg = messages
            .iter()
            .rev()
            .find(|m| m.role == MessageRole::User)
            .map(|m| m.content.as_str())
            .unwrap_or("Hello");

        let sessions = self.chat_sessions.read().await;
        let agent_session = sessions.get(agent_id).ok_or("Chat session not found")?;

        // Clear collected text from previous turn
        agent_session.collected.lock().unwrap().clear();

        agent_session.session.send(last_user_msg).await.map_err(|e| {
            log::error!("Copilot chat send error for {}: {}", agent_id, e);
            format!("Copilot error: {}", e)
        })?;

        // Wait for idle with timeout
        let timeout_result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            agent_session.idle_notify.notified(),
        ).await;

        if timeout_result.is_err() {
            drop(sessions);
            self.chat_sessions.write().await.remove(agent_id);
            return Err("Timed out waiting for response (30s)".to_string());
        }

        let response = agent_session.collected.lock().unwrap().clone();
        log::debug!("Copilot response: {}", &response[..response.len().min(100)]);

        Ok(BackendResponse {
            content: response,
            needs_attention: false,
        })
    }

    async fn is_available(&self) -> bool {
        // The SDK handles auth via the Copilot CLI; assume available if client can be built
        match Client::builder().use_stdio(true).build() {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    async fn destroy_chat_session(&self, agent_id: &str) {
        let mut sessions = self.chat_sessions.write().await;
        if let Some(agent_session) = sessions.remove(agent_id) {
            let _ = agent_session.session.destroy().await;
            log::info!("Destroyed chat session for agent {} (new session requested)", agent_id);
        }
    }

    async fn list_models(&self) -> Result<Vec<ModelOption>, String> {
        self.ensure_client().await?;
        let client_lock = self.client.read().await;
        let client = client_lock.as_ref().unwrap();
        let models = client
            .list_models()
            .await
            .map_err(|e| format!("Failed to list models: {}", e))?;
        Ok(models
            .into_iter()
            .map(|m| ModelOption {
                id: m.id.clone(),
                name: m.name,
            })
            .collect())
    }

    async fn list_agents(&self, cwd: Option<&str>) -> Result<Vec<AgentOption>, String> {
        let mut agents = Vec::new();

        // Scan ~/.copilot/agents/*.md (user-level)
        if let Some(home) = dirs::home_dir() {
            let user_dir = home.join(".copilot").join("agents");
            if let Ok(entries) = std::fs::read_dir(&user_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            agents.push(AgentOption {
                                name: stem.to_string(),
                                source: "user".to_string(),
                            });
                        }
                    }
                }
            }
        }

        // Scan <cwd>/.github/agents/*.md (repo-level)
        if let Some(dir) = cwd {
            let repo_dir = std::path::Path::new(dir).join(".github").join("agents");
            if let Ok(entries) = std::fs::read_dir(&repo_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            if !agents.iter().any(|a| a.name == stem) {
                                agents.push(AgentOption {
                                    name: stem.to_string(),
                                    source: "repo".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(agents)
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}