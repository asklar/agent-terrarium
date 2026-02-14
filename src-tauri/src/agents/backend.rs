use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Configuration for an agent's backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// Backend provider ID (e.g., "echo", "copilot", "claude")
    pub backend_id: String,
    /// Optional model override (e.g., "gpt-4", "claude-3-opus")
    #[serde(default)]
    pub model: Option<String>,
    /// System prompt / personality instructions
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// Custom agent name within the backend (e.g., custom Copilot agent)
    #[serde(default)]
    pub custom_agent: Option<String>,
    /// Awareness level: 0=chat only, 1=major events, 2=social, 3=full
    #[serde(default)]
    pub awareness_level: u8,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            backend_id: "echo".to_string(),
            model: None,
            system_prompt: None,
            custom_agent: None,
            awareness_level: 0,
        }
    }
}

/// Message in the conversation
#[derive(Debug, Clone)]
pub struct BackendMessage {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

/// Result of a backend response
#[derive(Debug, Clone)]
pub struct BackendResponse {
    pub content: String,
    /// Whether the agent should request user attention
    pub needs_attention: bool,
}

/// Trait for agent backend providers
#[async_trait]
pub trait AgentBackend: Send + Sync {
    /// Unique ID for this backend (e.g., "echo", "copilot", "claude")
    fn id(&self) -> &str;

    /// Display name (e.g., "GitHub Copilot", "Claude")
    fn display_name(&self) -> &str;

    /// Generate a response given conversation history and config
    async fn respond(
        &self,
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String>;

    /// Check if this backend is available/configured
    async fn is_available(&self) -> bool;
}
