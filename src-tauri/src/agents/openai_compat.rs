use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use super::backend::{AgentBackend, BackendConfig, BackendMessage, BackendResponse, MessageRole};

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: Option<String>,
}

pub struct OpenAICompatBackend {
    id: String,
    display_name: String,
    endpoint: String,
    default_model: String,
    credential_key: String,
    api_key: Arc<RwLock<Option<String>>>,
    client: Client,
}

impl OpenAICompatBackend {
    pub fn new(
        id: &str,
        display_name: &str,
        endpoint: &str,
        default_model: &str,
        credential_key: &str,
    ) -> Self {
        Self {
            id: id.to_string(),
            display_name: display_name.to_string(),
            endpoint: endpoint.to_string(),
            default_model: default_model.to_string(),
            credential_key: credential_key.to_string(),
            api_key: Arc::new(RwLock::new(None)),
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AgentBackend for OpenAICompatBackend {
    fn id(&self) -> &str {
        &self.id
    }

    fn display_name(&self) -> &str {
        &self.display_name
    }

    async fn respond(
        &self,
        config: &BackendConfig,
        messages: &[BackendMessage],
    ) -> Result<BackendResponse, String> {
        let api_key = self.api_key.read().await;
        let api_key = api_key.as_ref().ok_or_else(|| {
            format!(
                "No API key configured for {}. Set one via the context menu.",
                self.display_name
            )
        })?;

        let model = config
            .model
            .as_deref()
            .unwrap_or(&self.default_model);

        let mut chat_messages = Vec::new();

        if let Some(ref prompt) = config.system_prompt {
            chat_messages.push(ChatMessage {
                role: "system".to_string(),
                content: prompt.clone(),
            });
        }

        for msg in messages {
            let role = match msg.role {
                MessageRole::System => "system",
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
            };
            chat_messages.push(ChatMessage {
                role: role.to_string(),
                content: msg.content.clone(),
            });
        }

        let request = ChatRequest {
            model: model.to_string(),
            messages: chat_messages,
            max_tokens: Some(1024),
            temperature: Some(0.7),
        };

        let response = self
            .client
            .post(&self.endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body));
        }

        let chat_response: ChatResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let content = chat_response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_else(|| "No response generated.".to_string());

        Ok(BackendResponse {
            content,
            needs_attention: false,
        })
    }

    async fn is_available(&self) -> bool {
        self.api_key.read().await.is_some()
    }

    async fn set_api_key(&self, key: String) {
        *self.api_key.write().await = Some(key);
    }

    fn credential_key(&self) -> Option<&str> {
        Some(&self.credential_key)
    }
}

pub fn create_copilot_backend() -> OpenAICompatBackend {
    OpenAICompatBackend::new(
        "copilot",
        "GitHub Copilot",
        "https://api.githubcopilot.com/chat/completions",
        "gpt-4o",
        "copilot",
    )
}

pub fn create_openai_backend() -> OpenAICompatBackend {
    OpenAICompatBackend::new(
        "openai",
        "OpenAI",
        "https://api.openai.com/v1/chat/completions",
        "gpt-4o",
        "openai",
    )
}
