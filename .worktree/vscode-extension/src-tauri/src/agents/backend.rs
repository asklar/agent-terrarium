use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Configuration for an agent's backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// Backend provider ID (e.g., "echo", "copilot", "claude")
    pub backend_id: String,
    /// Optional model override for chat (e.g., "gpt-4", "claude-3-opus")
    #[serde(default)]
    pub model: Option<String>,
    /// Optional model for awareness events (defaults to fast/cheap model)
    #[serde(default)]
    pub awareness_model: Option<String>,
    /// System prompt / personality instructions
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// Custom agent name within the backend (e.g., custom Copilot agent)
    #[serde(default)]
    pub custom_agent: Option<String>,
    /// Awareness level: 0=chat only, 1=major events, 2=social, 3=full
    #[serde(default)]
    pub awareness_level: u8,
    /// Enable text-to-speech for say tool responses
    #[serde(default)]
    pub tts_enabled: bool,
    /// Working directory for the agent
    #[serde(default)]
    pub cwd: Option<String>,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            backend_id: "echo".to_string(),
            model: None,
            awareness_model: None,
            system_prompt: None,
            custom_agent: None,
            awareness_level: 0,
            tts_enabled: false,
            cwd: None,
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
    #[allow(dead_code)]
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

    /// Generate a response given conversation history and config.
    /// `agent_id` identifies the agent so backends can reuse sessions.
    async fn respond(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String>;

    /// Destroy a chat session for an agent (e.g. when user starts a new conversation).
    async fn destroy_chat_session(&self, _agent_id: &str) {}

    /// Check if this backend is available/configured
    async fn is_available(&self) -> bool;

    /// List available models for this backend (empty by default)
    async fn list_models(&self) -> Result<Vec<ModelOption>, String> {
        Ok(vec![])
    }

    /// List available custom agents for this backend (empty by default)
    async fn list_agents(&self, _cwd: Option<&str>) -> Result<Vec<AgentOption>, String> {
        Ok(vec![])
    }

    /// Set API key for this backend (no-op by default)
    async fn set_api_key(&self, _key: String) {}

    /// Get the credential key for loading from the store (None for backends that don't need keys)
    fn credential_key(&self) -> Option<&str> {
        None
    }

    /// Downcast to concrete type for backend-specific features
    fn as_any(&self) -> &dyn std::any::Any;
}

/// A model option returned by list_models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelOption {
    pub id: String,
    pub name: String,
}

/// A custom agent option returned by list_agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOption {
    pub name: String,
    /// Where the agent was found (user, repo, org)
    pub source: String,
}
