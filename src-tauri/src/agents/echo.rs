use async_trait::async_trait;

use super::backend::{AgentBackend, BackendConfig, BackendMessage, BackendResponse, MessageRole};

pub struct EchoBackend;

#[async_trait]
impl AgentBackend for EchoBackend {
    fn id(&self) -> &str {
        "echo"
    }

    fn display_name(&self) -> &str {
        "Echo (NPC)"
    }

    async fn respond(
        &self,
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String> {
        let last_user_msg = messages
            .iter()
            .rev()
            .find(|m| m.role == MessageRole::User)
            .map(|m| m.content.as_str())
            .unwrap_or("");

        let content = match &config.system_prompt {
            Some(prompt) if !prompt.is_empty() => {
                format!("{} Echo: {}", prompt, last_user_msg)
            }
            _ => format!("Echo: {}", last_user_msg),
        };

        Ok(BackendResponse {
            content,
            needs_attention: false,
        })
    }

    async fn is_available(&self) -> bool {
        true
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}