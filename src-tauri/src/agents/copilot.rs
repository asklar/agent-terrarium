use async_trait::async_trait;
use copilot_sdk::{Client, CustomAgentConfig, SessionConfig, SystemMessageConfig, SystemMessageMode};
use std::sync::Arc;
use tokio::sync::RwLock;

use super::backend::{AgentBackend, AgentOption, BackendConfig, BackendMessage, BackendResponse, MessageRole, ModelOption};

pub struct CopilotBackend {
    client: Arc<RwLock<Option<Client>>>,
}

impl CopilotBackend {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
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
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String> {
        log::info!("Copilot respond: model={:?}, agent={:?}, {} messages",
            config.model, config.custom_agent, messages.len());
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

        let session = client
            .create_session(session_config)
            .await
            .map_err(|e| format!("Failed to create session: {}", e))?;

        let last_user_msg = messages
            .iter()
            .rev()
            .find(|m| m.role == MessageRole::User)
            .map(|m| m.content.as_str())
            .unwrap_or("Hello");

        let response = session
            .send_and_collect(last_user_msg, None)
            .await
            .map_err(|e| {
                log::error!("Copilot error: {}", e);
                format!("Copilot error: {}", e)
            })?;

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
}