use async_trait::async_trait;
use github_copilot_sdk::session::Session;
use github_copilot_sdk::session_events::AssistantMessageData;
use github_copilot_sdk::{
    Client, ClientOptions, CustomAgentConfig, LogLevel, MessageOptions, ResumeSessionConfig,
    SessionConfig, SessionId, SystemMessageConfig, Tool,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

use super::backend::{
    AgentBackend, AgentOption, BackendConfig, BackendMessage, BackendResponse, MessageRole,
    ModelOption,
};

struct AgentSession {
    session: Arc<Session>,
    turn_lock: Mutex<()>,
}

pub struct CopilotBackend {
    client: Arc<RwLock<Option<Client>>>,
    awareness_sessions: Arc<RwLock<HashMap<String, Arc<AgentSession>>>>,
    chat_sessions: Arc<RwLock<HashMap<String, Arc<AgentSession>>>>,
    awareness_creation_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    chat_creation_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

async fn creation_lock(
    locks: &Mutex<HashMap<String, Arc<Mutex<()>>>>,
    agent_id: &str,
) -> Arc<Mutex<()>> {
    let mut locks = locks.lock().await;
    locks
        .entry(agent_id.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn session_id_path(agent_id: &str) -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("agent-terrarium")
        .join("sessions");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{}.txt", agent_id))
}

fn config_directory() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("agent-terrarium")
        .join(".copilot");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn save_session_id(agent_id: &str, session_id: &SessionId) {
    let path = session_id_path(agent_id);
    let _ = std::fs::write(&path, session_id.as_str());
    log::info!("Saved session ID for {}: {}", agent_id, session_id);
}

fn load_session_id(agent_id: &str) -> Option<String> {
    let path = session_id_path(agent_id);
    std::fs::read_to_string(&path)
        .ok()
        .filter(|session_id| !session_id.is_empty())
}

fn delete_session_id(agent_id: &str) {
    let path = session_id_path(agent_id);
    let _ = std::fs::remove_file(&path);
}

fn system_message(config: &BackendConfig) -> Option<SystemMessageConfig> {
    config.system_prompt.as_ref().map(|prompt| {
        SystemMessageConfig::new()
            .with_mode("replace")
            .with_content(prompt)
    })
}

fn custom_agent(config: &BackendConfig) -> Option<CustomAgentConfig> {
    config.custom_agent.as_ref().map(|name| {
        CustomAgentConfig::new(name, config.system_prompt.clone().unwrap_or_default())
            .with_infer(true)
    })
}

fn create_session_config(config: &BackendConfig, tools: Option<Vec<Tool>>) -> SessionConfig {
    let mut session_config = SessionConfig::default()
        .with_client_name("agent-terrarium")
        .with_config_directory(config_directory())
        .approve_all_permissions();

    if let Some(model) = config.model.as_deref().filter(|model| !model.is_empty()) {
        session_config = session_config.with_model(model);
    }
    if let Some(cwd) = config.cwd.as_deref().filter(|cwd| !cwd.is_empty()) {
        session_config = session_config.with_working_directory(cwd);
    }
    if let Some(message) = system_message(config) {
        session_config = session_config.with_system_message(message);
    }
    if let Some(agent) = custom_agent(config) {
        let name = agent.name.clone();
        session_config = session_config.with_custom_agents([agent]).with_agent(name);
    }
    if let Some(tools) = tools {
        session_config = session_config.with_tools(tools);
    }

    session_config
}

fn resume_session_config(saved_id: &str, config: &BackendConfig) -> ResumeSessionConfig {
    let mut session_config = ResumeSessionConfig::new(SessionId::from(saved_id))
        .with_client_name("agent-terrarium")
        .with_config_directory(config_directory())
        .approve_all_permissions();

    if let Some(model) = config.model.as_deref().filter(|model| !model.is_empty()) {
        session_config = session_config.with_model(model);
    }
    if let Some(cwd) = config.cwd.as_deref().filter(|cwd| !cwd.is_empty()) {
        session_config = session_config.with_working_directory(cwd);
    }
    if let Some(message) = system_message(config) {
        session_config = session_config.with_system_message(message);
    }
    if let Some(agent) = custom_agent(config) {
        let name = agent.name.clone();
        session_config = session_config.with_custom_agents([agent]).with_agent(name);
    }

    session_config
}

fn assistant_content(event: Option<github_copilot_sdk::SessionEvent>) -> String {
    event
        .and_then(|event| event.typed_data::<AssistantMessageData>())
        .map(|message| message.content)
        .unwrap_or_default()
}

impl CopilotBackend {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            awareness_sessions: Arc::new(RwLock::new(HashMap::new())),
            chat_sessions: Arc::new(RwLock::new(HashMap::new())),
            awareness_creation_locks: Mutex::new(HashMap::new()),
            chat_creation_locks: Mutex::new(HashMap::new()),
        }
    }

    async fn ensure_client(&self) -> Result<(), String> {
        let mut client = self.client.write().await;
        if client.is_none() {
            log::info!("Starting official GitHub Copilot Rust SDK client...");
            let cli_log_dir = config_directory().join("logs");
            let _ = std::fs::create_dir_all(&cli_log_dir);
            let cli_log = cli_log_dir.join("copilot-cli.log");
            let options = ClientOptions::new()
                .with_log_level(LogLevel::Debug)
                .with_env([("COPILOT_DEBUG_LOG", cli_log.as_os_str())]);
            let started = Client::start(options).await.map_err(|error| {
                log::error!("Failed to start Copilot client: {}", error);
                format!("Failed to start Copilot client: {}", error)
            })?;
            log::info!(
                "Copilot Rust SDK client initialized (protocol v{})",
                github_copilot_sdk::SDK_PROTOCOL_VERSION
            );
            *client = Some(started);
        }
        Ok(())
    }

    async fn client(&self) -> Result<Client, String> {
        self.ensure_client().await?;
        self.client
            .read()
            .await
            .clone()
            .ok_or_else(|| "Copilot client is not initialized".to_string())
    }

    async fn get_or_create_awareness_session(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        tools: Vec<Tool>,
    ) -> Result<Arc<AgentSession>, String> {
        if let Some(session) = self.awareness_sessions.read().await.get(agent_id) {
            return Ok(session.clone());
        }

        let creation_lock = creation_lock(&self.awareness_creation_locks, agent_id).await;
        let _creating = creation_lock.lock().await;
        let concurrent_session = {
            let sessions = self.awareness_sessions.read().await;
            sessions.get(agent_id).cloned()
        };
        if let Some(session) = concurrent_session {
            return Ok(session);
        }

        let client = self.client().await?;
        let session = tokio::time::timeout(
            Duration::from_secs(30),
            client.create_session(create_session_config(config, Some(tools))),
        )
        .await
        .map_err(|_| "Timed out creating awareness session".to_string())?
        .map(Arc::new)
        .map_err(|error| format!("Failed to create awareness session: {}", error))?;

        log::info!(
            "Created awareness session for {}: {}",
            agent_id,
            session.id()
        );
        let agent_session = Arc::new(AgentSession {
            session,
            turn_lock: Mutex::new(()),
        });
        self.awareness_sessions
            .write()
            .await
            .insert(agent_id.to_string(), agent_session.clone());
        Ok(agent_session)
    }

    pub async fn dispatch_with_tools(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        prompt: &str,
        tools: Vec<Tool>,
    ) -> Result<String, String> {
        let agent_session = self
            .get_or_create_awareness_session(agent_id, config, tools)
            .await?;
        let _turn = agent_session.turn_lock.lock().await;

        match agent_session
            .session
            .send_and_wait(MessageOptions::new(prompt).with_wait_timeout(Duration::from_secs(15)))
            .await
        {
            Ok(event) => Ok(assistant_content(event)),
            Err(error) => {
                log::warn!("Awareness session failed for {}: {}", agent_id, error);
                self.awareness_sessions.write().await.remove(agent_id);
                let _ = agent_session.session.disconnect().await;
                Err(error.to_string())
            }
        }
    }

    #[allow(dead_code)]
    pub async fn remove_session(&self, agent_id: &str) {
        if let Some(agent_session) = self.awareness_sessions.write().await.remove(agent_id) {
            let _ = agent_session.session.disconnect().await;
            log::info!("Destroyed awareness session for {}", agent_id);
        }

        if let Some(agent_session) = self.chat_sessions.write().await.remove(agent_id) {
            let _ = agent_session.session.disconnect().await;
            log::info!("Destroyed chat session for {}", agent_id);
        }
    }

    async fn create_new_session(
        &self,
        client: &Client,
        config: &BackendConfig,
    ) -> Result<Arc<Session>, String> {
        tokio::time::timeout(
            Duration::from_secs(30),
            client.create_session(create_session_config(config, None)),
        )
        .await
        .map_err(|_| "Timed out creating Copilot session".to_string())?
        .map(Arc::new)
        .map_err(|error| format!("Failed to create session: {}", error))
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
        log::info!(
            "Copilot respond: agent={}, model={:?}, custom_agent={:?}, {} messages",
            agent_id,
            config.model,
            config.custom_agent,
            messages.len()
        );

        let existing = self.chat_sessions.read().await.get(agent_id).cloned();

        let agent_session = if let Some(session) = existing {
            log::info!("Reusing chat session for agent {}", agent_id);
            session
        } else {
            log::info!(
                "Acquiring chat session creation lock for agent {}",
                agent_id
            );
            let creation_lock = creation_lock(&self.chat_creation_locks, agent_id).await;
            let _creating = creation_lock.lock().await;
            let concurrent_session = {
                let sessions = self.chat_sessions.read().await;
                sessions.get(agent_id).cloned()
            };
            if let Some(session) = concurrent_session {
                log::info!("Reusing chat session created concurrently for {}", agent_id);
                session
            } else {
                let client = self.client().await?;
                let session = if let Some(saved_id) = load_session_id(agent_id) {
                    log::info!("Resuming session {} for agent {}", saved_id, agent_id);
                    match tokio::time::timeout(
                        Duration::from_secs(30),
                        client.resume_session(resume_session_config(&saved_id, config)),
                    )
                    .await
                    {
                        Ok(Ok(session)) => {
                            log::info!("Resumed session {}", session.id());
                            Arc::new(session)
                        }
                        Ok(Err(error)) => {
                            log::warn!(
                                "Failed to resume session {} for {}: {}, creating new",
                                saved_id,
                                agent_id,
                                error
                            );
                            delete_session_id(agent_id);
                            self.create_new_session(&client, config).await?
                        }
                        Err(_) => {
                            log::warn!(
                                "Timed out resuming session {} for {}, creating new",
                                saved_id,
                                agent_id
                            );
                            delete_session_id(agent_id);
                            self.create_new_session(&client, config).await?
                        }
                    }
                } else {
                    self.create_new_session(&client, config).await?
                };

                save_session_id(agent_id, session.id());
                let agent_session = Arc::new(AgentSession {
                    session,
                    turn_lock: Mutex::new(()),
                });
                self.chat_sessions
                    .write()
                    .await
                    .insert(agent_id.to_string(), agent_session.clone());
                log::info!("Chat session ready for agent {}", agent_id);
                agent_session
            }
        };
        log::info!("Waiting for chat turn lock for agent {}", agent_id);
        let _turn = agent_session.turn_lock.lock().await;
        log::info!("Acquired chat turn lock for agent {}", agent_id);

        let last_user_message = messages
            .iter()
            .rev()
            .find(|message| message.role == MessageRole::User)
            .map(|message| message.content.as_str())
            .unwrap_or("Hello");

        log::info!("Sending Copilot message for agent {}", agent_id);
        let response = agent_session
            .session
            .send_and_wait(
                MessageOptions::new(last_user_message).with_wait_timeout(Duration::from_secs(60)),
            )
            .await
            .map(assistant_content)
            .map_err(|error| {
                log::error!("Copilot chat error for {}: {}", agent_id, error);
                format!("Copilot error: {}", error)
            })?;
        log::info!("Copilot message completed for agent {}", agent_id);

        log::debug!("Copilot response: {}", &response[..response.len().min(100)]);

        Ok(BackendResponse {
            content: response,
            needs_attention: false,
        })
    }

    async fn is_available(&self) -> bool {
        self.ensure_client().await.is_ok()
    }

    async fn destroy_chat_session(&self, agent_id: &str) {
        if let Some(agent_session) = self.chat_sessions.write().await.remove(agent_id) {
            let _ = agent_session.session.disconnect().await;
            log::info!(
                "Destroyed chat session for agent {} (new session requested)",
                agent_id
            );
        }
        delete_session_id(agent_id);
    }

    async fn list_models(&self) -> Result<Vec<ModelOption>, String> {
        let client = self.client().await?;
        let models = tokio::time::timeout(Duration::from_secs(15), client.list_models())
            .await
            .map_err(|_| "Timed out listing Copilot models".to_string())?
            .map_err(|error| format!("Failed to list models: {}", error))?;

        Ok(models
            .into_iter()
            .map(|model| ModelOption {
                id: model.id,
                name: model.name,
            })
            .collect())
    }

    async fn list_agents(&self, cwd: Option<&str>) -> Result<Vec<AgentOption>, String> {
        let mut agents = Vec::new();

        if let Some(home) = dirs::home_dir() {
            let user_dir = home.join(".copilot").join("agents");
            if let Ok(entries) = std::fs::read_dir(&user_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|extension| extension.to_str()) == Some("md") {
                        if let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) {
                            agents.push(AgentOption {
                                name: stem.to_string(),
                                source: "user".to_string(),
                            });
                        }
                    }
                }
            }
        }

        if let Some(directory) = cwd {
            let repo_dir = std::path::Path::new(directory)
                .join(".github")
                .join("agents");
            if let Ok(entries) = std::fs::read_dir(&repo_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|extension| extension.to_str()) == Some("md") {
                        if let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) {
                            if !agents.iter().any(|agent| agent.name == stem) {
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
