use async_trait::async_trait;
use std::collections::HashMap;
use std::os::raw::c_char;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::backend::{AgentBackend, AgentOption, BackendConfig, BackendMessage, BackendResponse, MessageRole, ModelOption};
use super::copilot_ffi;

pub struct CopilotBackend {
    initialized: Arc<RwLock<bool>>,
    /// Persistent sessions for awareness events, keyed by agent_id
    awareness_sessions: Arc<RwLock<HashMap<String, String>>>, // agent_id → session_id
    /// Persistent sessions for user chat, keyed by agent_id
    chat_sessions: Arc<RwLock<HashMap<String, String>>>, // agent_id → session_id
}

fn session_id_path(agent_id: &str) -> std::path::PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("agent-terrarium")
        .join("sessions");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(format!("{}.txt", agent_id))
}

fn save_session_id(agent_id: &str, session_id: &str) {
    let path = session_id_path(agent_id);
    let _ = std::fs::write(&path, session_id);
    log::info!("Saved session ID for {}: {}", agent_id, session_id);
}

fn load_session_id(agent_id: &str) -> Option<String> {
    let path = session_id_path(agent_id);
    std::fs::read_to_string(&path).ok().filter(|s| !s.is_empty())
}

fn delete_session_id(agent_id: &str) {
    let path = session_id_path(agent_id);
    let _ = std::fs::remove_file(&path);
}



/// Build a JSON config string for the Go bridge from BackendConfig
fn build_config_json(config: &BackendConfig) -> String {
    serde_json::json!({
        "model": config.model,
        "system_prompt": config.system_prompt,
        "custom_agent": config.custom_agent,
        "working_directory": config.cwd,
    }).to_string()
}

impl CopilotBackend {
    pub fn new() -> Self {
        Self {
            initialized: Arc::new(RwLock::new(false)),
            awareness_sessions: Arc::new(RwLock::new(HashMap::new())),
            chat_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn ensure_init(&self) -> Result<(), String> {
        let mut init = self.initialized.write().await;
        if !*init {
            log::info!("Initializing Copilot Go bridge...");
            copilot_ffi::init()?;
            log::info!("Copilot Go bridge initialized (protocol v3)");
            *init = true;
        }
        Ok(())
    }

    /// Dispatch awareness events using a tool-enabled session.
    pub async fn dispatch_with_tools(
        &self,
        agent_id: &str,
        config: &BackendConfig,
        prompt: &str,
        tools: Vec<serde_json::Value>,
        tool_handlers: Vec<(String, Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync>)>,
    ) -> Result<String, String> {
        self.ensure_init().await?;

        // Check if we have an existing awareness session
        let existing = {
            let sessions = self.awareness_sessions.read().await;
            sessions.get(agent_id).cloned()
        };

        let sid = if let Some(sid) = existing {
            sid
        } else {
            // Create new session with tools
            let config_json = build_config_json(config);
            let tools_json = serde_json::to_string(&tools).map_err(|e| e.to_string())?;

            // Set up tool callback before creating session
            // Store handlers in a thread-local so the C callback can find them
            {
                let mut handlers_map = TOOL_HANDLERS.lock().unwrap();
                for (name, handler) in &tool_handlers {
                    handlers_map.insert(name.clone(), handler.clone());
                }
            }
            copilot_ffi::set_tool_callback(Some(tool_callback_trampoline));

            let sid = copilot_ffi::create_session_with_tools(&config_json, &tools_json)?;
            log::info!("Created awareness session for {}: {}", agent_id, sid);

            let mut sessions = self.awareness_sessions.write().await;
            sessions.insert(agent_id.to_string(), sid.clone());
            sid
        };

        // Update tool handlers for this call
        {
            let mut handlers_map = TOOL_HANDLERS.lock().unwrap();
            for (name, handler) in &tool_handlers {
                handlers_map.insert(name.clone(), handler.clone());
            }
        }

        let result = copilot_ffi::send_with_tools(&sid, prompt, 15);

        match result {
            Ok(response) => Ok(response),
            Err(e) => {
                // Session might be broken, remove it so it gets recreated
                log::warn!("Awareness session failed for {}: {}", agent_id, e);
                let mut sessions = self.awareness_sessions.write().await;
                sessions.remove(agent_id);
                copilot_ffi::destroy_session(&sid);
                Err(e)
            }
        }
    }

    /// Remove a persistent session
    #[allow(dead_code)]
    pub async fn remove_session(&self, agent_id: &str) {
        let mut sessions = self.awareness_sessions.write().await;
        if let Some(sid) = sessions.remove(agent_id) {
            copilot_ffi::destroy_session(&sid);
            log::info!("Destroyed awareness session for {}", agent_id);
        }
        drop(sessions);

        let mut chat = self.chat_sessions.write().await;
        if let Some(sid) = chat.remove(agent_id) {
            copilot_ffi::destroy_session(&sid);
            log::info!("Destroyed chat session for {}", agent_id);
        }
    }
}

// Global tool handler registry (used by the C callback trampoline)
use std::sync::Mutex;
static TOOL_HANDLERS: std::sync::LazyLock<Mutex<HashMap<String, Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// C callback that Go invokes when a tool is called.
/// Returns a malloc'd C string with the result.
unsafe extern "C" fn tool_callback_trampoline(
    _session_id: *mut c_char,
    tool_name: *mut c_char,
    args_json: *mut c_char,
) -> *mut c_char {
    let name = std::ffi::CStr::from_ptr(tool_name).to_string_lossy();
    let args_str = std::ffi::CStr::from_ptr(args_json).to_string_lossy();
    let args: serde_json::Value = serde_json::from_str(&args_str).unwrap_or(serde_json::Value::Null);

    let result = {
        let handlers = TOOL_HANDLERS.lock().unwrap();
        if let Some(handler) = handlers.get(name.as_ref()) {
            handler(&name, &args)
        } else {
            format!("Unknown tool: {}", name)
        }
    };

    // Allocate with libc::malloc so Go can free with C.free
    let c_result = std::ffi::CString::new(result).unwrap_or_default();
    let len = c_result.as_bytes_with_nul().len();
    let ptr = libc::malloc(len) as *mut c_char;
    if !ptr.is_null() {
        std::ptr::copy_nonoverlapping(c_result.as_ptr(), ptr, len);
    }
    ptr
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

        self.ensure_init().await?;

        // Get or create a persistent chat session
        let need_create = {
            let sessions = self.chat_sessions.read().await;
            !sessions.contains_key(agent_id)
        };

        if need_create {
            let config_json = build_config_json(config);

            // Try to resume a previously persisted session
            let sid = if let Some(saved_id) = load_session_id(agent_id) {
                log::info!("Resuming session {} for agent {}", saved_id, agent_id);
                match copilot_ffi::resume_session(&saved_id, &config_json) {
                    Ok(sid) => {
                        log::info!("Resumed session {}", sid);
                        sid
                    }
                    Err(e) => {
                        log::warn!("Failed to resume session: {}, creating new", e);
                        delete_session_id(agent_id);
                        copilot_ffi::create_session(&config_json)?
                    }
                }
            } else {
                copilot_ffi::create_session(&config_json)
                    .map_err(|e| {
                        log::error!("Failed to create Copilot session: {}", e);
                        if e.contains("CLI process exited") {
                            let init = self.initialized.clone();
                            tokio::spawn(async move {
                                *init.write().await = false;
                            });
                        }
                        format!("Failed to create session: {}", e)
                    })?
            };

            save_session_id(agent_id, &sid);

            let mut sessions = self.chat_sessions.write().await;
            sessions.insert(agent_id.to_string(), sid);
        }

        // Send only the latest user message
        let last_user_msg = messages
            .iter()
            .rev()
            .find(|m| m.role == MessageRole::User)
            .map(|m| m.content.as_str())
            .unwrap_or("Hello");

        let sid = {
            let sessions = self.chat_sessions.read().await;
            sessions.get(agent_id).cloned().ok_or("Chat session not found")?
        };

        let response = copilot_ffi::send_and_wait(&sid, last_user_msg, 60)
            .map_err(|e| {
                log::error!("Copilot chat error for {}: {}", agent_id, e);
                format!("Copilot error: {}", e)
            })?;

        log::debug!("Copilot response: {}", &response[..response.len().min(100)]);

        Ok(BackendResponse {
            content: response,
            needs_attention: false,
        })
    }

    async fn is_available(&self) -> bool {
        // Try to init — if it works, the bridge is available
        match self.ensure_init().await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    async fn destroy_chat_session(&self, agent_id: &str) {
        let mut sessions = self.chat_sessions.write().await;
        if let Some(sid) = sessions.remove(agent_id) {
            copilot_ffi::destroy_session(&sid);
            log::info!("Destroyed chat session for agent {} (new session requested)", agent_id);
        }
        delete_session_id(agent_id);
    }

    async fn list_models(&self) -> Result<Vec<ModelOption>, String> {
        self.ensure_init().await?;
        let json_str = copilot_ffi::list_models()?;
        let models: Vec<ModelOption> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse models: {}", e))?;
        Ok(models)
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