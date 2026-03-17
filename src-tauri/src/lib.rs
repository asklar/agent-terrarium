mod agents;
mod simulation;
mod tts;

use tauri::Manager;
use tauri::{Emitter};
use tauri_plugin_store::StoreExt;

use agents::backend::{BackendConfig, BackendMessage, MessageRole};
use agents::copilot::CopilotBackend;
use agents::echo::EchoBackend;
use agents::openai_compat;
use agents::registry::BackendRegistry;
use simulation::types::{AppConfig, Vec2};
use simulation::world::World;
use std::sync::Arc;
use std::time::Duration;

#[tauri::command]
fn get_world_state(world: tauri::State<'_, Arc<World>>) -> simulation::types::WorldState {
    world.get_state()
}

#[tauri::command]
fn throw_ball(world: tauri::State<'_, Arc<World>>, x: f64, y: f64, vx: f64, vy: f64) {
    world.throw_ball(x, y, vx, vy);
}

#[tauri::command]
fn drop_files(world: tauri::State<'_, Arc<World>>, files: Vec<(String, String)>, x: f64, y: f64) -> String {
    world.drop_files(files, x, y)
}

#[tauri::command]
fn remove_dropped_file(world: tauri::State<'_, Arc<World>>, file_id: String) {
    world.remove_dropped_file(&file_id);
}

#[tauri::command]
fn push_bubble(world: tauri::State<'_, Arc<World>>, agent_id: String, content: String, is_emoji: bool, duration: f64) {
    world.push_bubble(&agent_id, content, is_emoji, duration);
}

#[tauri::command]
async fn speak_sapi(text: String, voice_index: u32, rate: i32) -> Result<Vec<u8>, String> {
    std::thread::spawn(move || tts::speak_to_wav(text, voice_index, rate))
        .join()
        .map_err(|_| "TTS thread panicked".to_string())?
}

#[tauri::command]
fn click_agent(world: tauri::State<'_, Arc<World>>, agent_id: String) -> bool {
    let restored = load_chat_history(&agent_id);
    let msgs = if restored.is_empty() { None } else { Some(restored) };
    world.click_agent(&agent_id, msgs)
}

#[tauri::command]
async fn send_message(world: tauri::State<'_, Arc<World>>, app: tauri::AppHandle, agent_id: String, text: String) -> Result<String, String> {
    // Add user message and get backend config
    let backend_config = world.add_user_message(&agent_id, &text);

    let backend_config = match backend_config {
        Some(cfg) => cfg,
        None => return Err("Agent not found".to_string()),
    };

    // Build conversation history for the backend
    let chat_messages = world.get_chat_messages(&agent_id);
    let messages: Vec<BackendMessage> = chat_messages
        .iter()
        .map(|m| BackendMessage {
            role: if m.from_user {
                MessageRole::User
            } else {
                MessageRole::Assistant
            },
            content: m.text.clone(),
        })
        .collect();

    // Look up backend and generate response
    let registry = world.get_backend_registry();
    let backend = registry
        .get(&backend_config.backend_id)
        .unwrap_or_else(|| {
            log::warn!("Backend '{}' not found, falling back to echo", backend_config.backend_id);
            registry.get("echo").expect("echo backend must be registered")
        });

    // Lazily load credential from store if backend needs one and isn't ready
    if !backend.is_available().await {
        if let Some(cred_key) = backend.credential_key() {
            if let Ok(store) = app.store("credentials.json") {
                if let Some(key) = store.get(cred_key).and_then(|v| v.as_str().map(String::from)) {
                    backend.set_api_key(key).await;
                }
            }
        }
    }

    let response = backend
        .respond(&agent_id, &backend_config, &messages)
        .await
        .unwrap_or_else(|e| {
            log::error!("Backend respond error for {}: {}", agent_id, e);
            agents::backend::BackendResponse {
                content: format!("Error: {}", e),
                needs_attention: false,
            }
        });

    // Append the response to the chat session
    world.complete_response(&agent_id, &response.content);

    // Detach any claimed file from this agent now that the backend has responded
    world.detach_file(&agent_id);

    // Persist chat history to disk
    let updated_messages = world.get_chat_messages(&agent_id);
    save_chat_history(&agent_id, &updated_messages);

    // Request attention unless the user is looking at this agent's chat
    if response.needs_attention || backend_config.backend_id != "echo" {
        let chat_label = format!("chat-{}", agent_id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_"));
        let dominated = app.webview_windows().iter().any(|(label, w)| {
            w.is_focused().unwrap_or(false) && (label == "main" || *label == chat_label)
        });
        if !dominated {
            world.request_attention(&agent_id);
        }
    }

    Ok(response.content)
}

#[tauri::command]
fn dismiss_chat(world: tauri::State<'_, Arc<World>>, agent_id: String) {
    world.dismiss_chat(&agent_id);
}

#[tauri::command]
async fn clear_chat(world: tauri::State<'_, Arc<World>>, agent_id: String) -> Result<(), String> {
    world.clear_chat(&agent_id);
    // Delete persisted history
    let path = chat_history_path(&agent_id);
    let _ = std::fs::remove_file(path);
    // Destroy the SDK chat session so next message creates a fresh one
    let registry = world.get_backend_registry();
    if let Some(backend) = registry.get("copilot") {
        backend.destroy_chat_session(&agent_id).await;
    }
    Ok(())
}

#[tauri::command]
fn resize_world(world: tauri::State<'_, Arc<World>>, width: f64, height: f64) {
    world.resize(width, height);
}

#[tauri::command]
fn add_agent(world: tauri::State<'_, Arc<World>>, avatar: String, name: String) -> String {
    world.add_agent(&avatar, &name)
}

#[tauri::command]
fn remove_agent(world: tauri::State<'_, Arc<World>>, agent_id: String) {
    world.remove_agent(&agent_id);
}

#[tauri::command]
fn update_mouse(world: tauri::State<'_, Arc<World>>, x: Option<f64>, y: Option<f64>) {
    world.update_mouse(x, y);
}

#[tauri::command]
fn set_gear(world: tauri::State<'_, Arc<World>>, agent_id: String, gear_ids: Vec<String>) {
    world.set_gear(&agent_id, gear_ids);
}

#[tauri::command]
fn request_attention(world: tauri::State<'_, Arc<World>>, agent_id: String) {
    world.request_attention(&agent_id);
}

#[tauri::command]
fn dismiss_attention(world: tauri::State<'_, Arc<World>>, agent_id: String) {
    world.dismiss_attention(&agent_id);
}

#[tauri::command]
async fn set_credential(app: tauri::AppHandle, backend_id: String, key: String) -> Result<(), String> {
    let store = app.store("credentials.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set(&backend_id, serde_json::Value::String(key));
    store.save().map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_credential(app: tauri::AppHandle, backend_id: String) -> Result<Option<String>, String> {
    let store = app.store("credentials.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let value = store.get(&backend_id);
    Ok(value.and_then(|v: serde_json::Value| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
async fn delete_credential(app: tauri::AppHandle, backend_id: String) -> Result<(), String> {
    let store = app.store("credentials.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.delete(&backend_id);
    store.save().map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn has_credential(app: tauri::AppHandle, backend_id: String) -> Result<bool, String> {
    let store = app.store("credentials.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    Ok(store.get(&backend_id).is_some())
}

#[tauri::command]
async fn fetch_location() -> Result<serde_json::Value, String> {
    let resp = reqwest::get("https://ipwho.is/")
        .await
        .map_err(|e| format!("Location fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Location HTTP {}", resp.status()));
    }
    let data = resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Location parse failed: {e}"))?;
    if data.get("success").and_then(|s| s.as_bool()) == Some(false) {
        let msg = data.get("message").and_then(|m| m.as_str()).unwrap_or("unknown");
        return Err(format!("Location lookup failed: {msg}"));
    }
    let normalized = serde_json::json!({
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "city": data.get("city"),
    });
    Ok(normalized)
}

#[tauri::command]
async fn fetch_weather(lat: f64, lon: f64) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,cloudcover,precipitation,weathercode&daily=sunrise,sunset&timezone=auto&forecast_days=1"
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Weather fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Weather HTTP {}", resp.status()));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Weather parse failed: {e}"))
}

fn config_path() -> std::path::PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("agent-terrarium.json");
    path
}

fn user_packages_dir() -> std::path::PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("agent-terrarium");
    path.push("packages");
    path
}

fn chat_history_dir() -> std::path::PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("agent-terrarium");
    path.push("chat");
    path
}

fn chat_history_path(agent_id: &str) -> std::path::PathBuf {
    let safe_id = agent_id.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    chat_history_dir().join(format!("{}.json", safe_id))
}

fn save_chat_history(agent_id: &str, messages: &[simulation::types::ChatMessage]) {
    let dir = chat_history_dir();
    if std::fs::create_dir_all(&dir).is_err() { return; }
    let path = chat_history_path(agent_id);
    if let Ok(json) = serde_json::to_string_pretty(messages) {
        let _ = std::fs::write(path, json);
    }
}

fn load_chat_history(agent_id: &str) -> Vec<simulation::types::ChatMessage> {
    let path = chat_history_path(agent_id);
    if !path.exists() { return Vec::new(); }
    std::fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

/// Watch package directories for changes and emit "packages-changed" to the frontend.
fn start_package_watcher(app_handle: tauri::AppHandle) {
    use notify::{RecursiveMode, Watcher, Config};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();
    let mut watcher = match notify::RecommendedWatcher::new(tx, Config::default()) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("Failed to create package watcher: {}", e);
            return;
        }
    };

    // Watch user packages dir
    let user_dir = user_packages_dir();
    if user_dir.exists() {
        let _ = watcher.watch(&user_dir, RecursiveMode::Recursive);
        log::info!("Watching user packages: {:?}", user_dir);
    }

    // Watch built-in packages dir (repo root packages/ in dev)
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let builtin_dir = resource_dir.join("packages");
        if builtin_dir.exists() {
            let _ = watcher.watch(&builtin_dir, RecursiveMode::Recursive);
            log::info!("Watching built-in packages: {:?}", builtin_dir);
        }
    }
    // Also try CWD-based packages/ for dev mode
    let cwd_packages = std::env::current_dir()
        .map(|d| d.join("packages"))
        .unwrap_or_default();
    if cwd_packages.exists() {
        let _ = watcher.watch(&cwd_packages, RecursiveMode::Recursive);
        log::info!("Watching dev packages: {:?}", cwd_packages);
    }

    std::thread::spawn(move || {
        let _watcher = watcher; // prevent drop
        let mut last_emit = std::time::Instant::now();
        loop {
            match rx.recv() {
                Ok(_event) => {
                    // Debounce: only emit once per 500ms
                    let now = std::time::Instant::now();
                    if now.duration_since(last_emit) > Duration::from_millis(500) {
                        last_emit = now;
                        log::info!("Package files changed, notifying frontend");
                        let _ = app_handle.emit("packages-changed", ());
                    }
                }
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
fn load_user_packages() -> Result<Vec<String>, String> {
    let dir = user_packages_dir();
    log::info!("Loading user packages from {:?}", dir);
    if !dir.exists() {
        // Create the directory so users know where to put packages
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }
    let mut packages = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            packages.push(content);
        } else if path.is_dir() {
            // Scan subdirectories for .json package files
            if let Ok(sub_entries) = std::fs::read_dir(&path) {
                for sub in sub_entries.flatten() {
                    let sp = sub.path();
                    if sp.extension().and_then(|e| e.to_str()) == Some("json") {
                        if let Ok(content) = std::fs::read_to_string(&sp) {
                            packages.push(content);
                        }
                    }
                }
            }
        }
    }
    Ok(packages)
}

/// Read a file from user packages dir as a data URL.
/// Path is relative to ~/agent-terrarium/packages/, e.g. "rio/christ-redeemer.svg"
#[tauri::command]
fn read_user_package_file(path: String) -> Result<String, String> {
    let dir = user_packages_dir();
    let file = dir.join(&path);
    // Security: ensure resolved path is inside the packages dir
    let canonical = file.canonicalize().map_err(|e| format!("File not found: {}", e))?;
    let canonical_dir = dir.canonicalize().unwrap_or(dir);
    if !canonical.starts_with(&canonical_dir) {
        return Err("Access denied".to_string());
    }
    let data = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    let mime = match canonical.extension().and_then(|e| e.to_str()) {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    };
    // Encode as base64 data URL
    use std::io::Write;
    let mut b64;
    let mut encoder = std::io::Cursor::new(Vec::new());
    write!(encoder, "data:{};base64,", mime).unwrap();
    b64 = String::from_utf8(encoder.into_inner()).unwrap();
    // Simple base64 encoding without external crate
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        b64.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        b64.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if i + 1 < data.len() {
            b64.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            b64.push('=');
        }
        if i + 2 < data.len() {
            b64.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            b64.push('=');
        }
        i += 3;
    }
    Ok(b64)
}

#[tauri::command]
fn set_backend_config(world: tauri::State<'_, Arc<World>>, agent_id: String, backend_config: BackendConfig) {
    world.set_backend_config(&agent_id, backend_config);
}

#[tauri::command]
async fn list_backend_models(world: tauri::State<'_, Arc<World>>, backend_id: String) -> Result<Vec<agents::backend::ModelOption>, String> {
    let registry = world.get_backend_registry();
    let backend = registry.get(&backend_id).ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend.list_models().await
}

#[tauri::command]
async fn list_backend_agents(world: tauri::State<'_, Arc<World>>, backend_id: String, cwd: Option<String>) -> Result<Vec<agents::backend::AgentOption>, String> {
    let registry = world.get_backend_registry();
    let backend = registry.get(&backend_id).ok_or_else(|| format!("Unknown backend: {}", backend_id))?;
    backend.list_agents(cwd.as_deref()).await
}

#[tauri::command]
fn rename_agent(world: tauri::State<'_, Arc<World>>, agent_id: String, name: String) {
    world.rename_agent(&agent_id, &name);
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
fn save_config(theme: String, window_x: Option<i32>, window_y: Option<i32>, window_width: Option<u32>, window_height: Option<u32>, music_muted: Option<bool>, dynamic_sky: Option<bool>, world: tauri::State<'_, Arc<World>>) -> Result<(), String> {
    log::info!("Saving config: theme={}", theme);
    let agents = world.get_agent_configs();
    let window = match (window_x, window_y, window_width, window_height) {
        (Some(x), Some(y), Some(w), Some(h)) => Some(simulation::types::WindowConfig { x, y, width: w, height: h }),
        _ => None,
    };
    let state = world.get_state();
    let config = AppConfig {
        theme,
        agents,
        window,
        ball_max_captures: state.ball_max_captures,
        ball_kick_on_capture: state.ball_kick_on_capture,
        attention_interval_secs: state.attention_interval_secs,
        music_muted: music_muted.unwrap_or(false),
        dynamic_sky: dynamic_sky.unwrap_or(false),
    };
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_config() -> Result<AppConfig, String> {
    let path = config_path();
    if !path.exists() {
        return Err("No config file found".to_string());
    }
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

struct SplashWait(bool);

#[tauri::command]
fn get_splash_wait(state: tauri::State<'_, SplashWait>) -> bool {
    state.0
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    log::info!("Agent Terrarium starting up");
    let splash_wait = std::env::args().any(|a| a == "--splash-wait");

    // Create backend registry with all backends
    let mut registry = BackendRegistry::new();
    registry.register(Arc::new(EchoBackend));
    registry.register(Arc::new(CopilotBackend::new()));
    registry.register(Arc::new(openai_compat::create_openai_backend()));
    let registry = Arc::new(registry);

    let world = Arc::new(World::new(Vec2::new(800.0, 400.0), registry));

    // Restore agents/settings from saved config
    let path = config_path();
    if path.exists() {
        if let Ok(json) = std::fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AppConfig>(&json) {
                log::info!("Loaded config from {:?}: {} agents", path, config.agents.len());
                world.load_from_config(&config);
            } else {
                log::warn!("Failed to parse config at {:?}", path);
            }
        }
    } else {
        log::info!("No config file at {:?}, using defaults", path);
    }

    // Spawn simulation tick loop
    let world_tick = world.clone();
    std::thread::spawn(move || {
        let tick_duration = Duration::from_millis(50); // 20 ticks/sec
        loop {
            world_tick.tick();
            std::thread::sleep(tick_duration);
        }
    });

    // Spawn event dispatcher with a single tokio runtime (sessions persist across dispatches)
    let world_events = world.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            use std::collections::HashMap;
            let mut cooldowns: HashMap<String, std::time::Instant> = HashMap::new();
            let cooldown_duration = Duration::from_secs(15);

            loop {
                tokio::time::sleep(Duration::from_secs(2)).await;

                let events = world_events.drain_events();
                if events.is_empty() {
                    continue;
                }

                let agents = world_events.get_agent_awareness();
                log::debug!("Event dispatcher: {} events, {} agents", events.len(), agents.len());

                for (agent_id, agent_name, awareness_level) in &agents {
                    if *awareness_level == 0 {
                        continue;
                    }

                    // Check cooldown
                    let now = std::time::Instant::now();
                    if let Some(last) = cooldowns.get(agent_id) {
                        if now.duration_since(*last) < cooldown_duration {
                            continue;
                        }
                    }

                    // Filter events by awareness level
                    let relevant: Vec<String> = events.iter()
                        .filter(|e| e.min_awareness_level() <= *awareness_level)
                        .map(|e| e.to_natural_language(agent_name))
                        .collect();

                    if relevant.is_empty() {
                        continue;
                    }

                    log::info!("Dispatching {} events to {} (awareness={})", relevant.len(), agent_name, awareness_level);
                    cooldowns.insert(agent_id.clone(), now);

                    // Get backend config and avatar for this agent
                    let state = world_events.state.lock().unwrap();
                    let agent = state.agents.iter().find(|a| a.id == *agent_id);
                    let config = agent.map(|a| a.backend_config.clone());
                    let avatar = agent.map(|a| a.avatar.clone()).unwrap_or_default();
                    drop(state);

                    if let Some(config) = config {
                        // Use awareness_model for events, defaulting to a fast model
                        let mut event_config = config.clone();
                        let default_fast_model = "claude-haiku-4.5".to_string();
                        event_config.model = config.awareness_model.clone()
                            .or_else(|| Some(default_fast_model));

                        let personality_hint = match avatar.as_str() {
                            a if a.contains("cat") => "You are playful, curious, and sometimes aloof. You purr, meow, and chase things.",
                            a if a.contains("dog") => "You are loyal, excited, and love to play. You bark, wag your tail, and fetch.",
                            a if a.contains("squirrel") => "You are energetic, skittish, and love collecting things. You chitter and scamper.",
                            a if a.contains("robot") => "You are logical but learning emotions. You beep, whir, and compute feelings.",
                            a if a.contains("bunny") || a.contains("rabbit") => "You are gentle, hoppy, and love treats. You wiggle your nose and thump.",
                            a if a.contains("frog") => "You are chill, zen, and love rain. You ribbit and hop contentedly.",
                            _ => "You are a cute little creature with your own personality.",
                        };

                        let system_context = config.system_prompt.clone().unwrap_or_else(|| {
                            format!(
                                "You are {}, a cute {} living in a digital terrarium. {}",
                                agent_name, avatar, personality_hint
                            )
                        });

                        let events_text = relevant.join("\n- ");

                        let backend_id = config.backend_id.clone();
                        let registry = world_events.backend_registry.clone();
                        let world_ref = world_events.clone();
                        let aid = agent_id.clone();
                        let aid2 = agent_id.clone();
                        let aname = agent_name.clone();

                        if backend_id == "copilot" {
                            // Build context about the terrarium state
                            let others = world_events.get_other_agent_names(agent_id);
                            let has_ball = world_events.has_ball();
                            let mut context_lines = Vec::new();
                            if !others.is_empty() {
                                context_lines.push(format!("Other creatures nearby: {}", others.join(", ")));
                            }
                            if has_ball {
                                context_lines.push("A ball is bouncing around!".to_string());
                            }
                            let context = if context_lines.is_empty() {
                                String::new()
                            } else {
                                format!("\n\nCurrent situation:\n- {}", context_lines.join("\n- "))
                            };

                            let prompt = format!(
                                "{}{}\n\nSomething just happened in your terrarium!\n- {}\n\n\
                                React in character using the available tools. You can call zero or more tools:\n\
                                - 'emote' — show an emoji reaction (quick emotional response)\n\
                                - 'say' — say something short in a speech bubble (1-5 words)\n\
                                - 'move_to' — walk toward something (target: 'ball', 'mouse', 'center', or an agent's name)\n\
                                - 'run_away' — flee from something (from: 'ball', 'mouse', or an agent's name)\n\n\
                                Do NOT reply with plain text. ONLY use tools to react. \
                                You can call multiple tools (e.g. emote AND move_to). \
                                If nothing interesting happened, don't call any tools.",
                                system_context, context, events_text
                            );

                            let tools = agents::tools::define_tools_json();
                            let handlers = agents::tools::create_handlers(
                                world_ref.clone(), aid.clone(), aname.clone(),
                            );

                            // Spawn in same runtime so sessions persist
                            tokio::spawn(async move {
                                if let Some(backend) = registry.get(&backend_id) {
                                    let copilot = backend.as_any()
                                        .downcast_ref::<CopilotBackend>()
                                        .expect("copilot backend");
                                    match copilot.dispatch_with_tools(&aid, &event_config, &prompt, tools, handlers).await {
                                        Ok(text) => {
                                            if !text.trim().is_empty() {
                                                log::debug!("Event text from {} (tools handled): {}", aname, text.trim());
                                            }
                                        }
                                        Err(e) => {
                                            log::warn!("Event dispatch to {} failed: {}", aname, e);
                                        }
                                    }
                                }
                            });
                        } else {
                            // Non-Copilot: text-only fallback
                            let prompt = format!(
                                "{}\n\nSomething just happened in your terrarium!\n- {}\n\n\
                                React in character! Respond with ONLY a single emoji OR a short expressive action/sound \
                                (like *purrs*, *gasps*, *bounces excitedly*). Keep it to 1-4 words max.",
                                system_context, events_text
                            );

                            let messages = vec![
                                BackendMessage {
                                    role: MessageRole::User,
                                    content: prompt,
                                },
                            ];

                            tokio::spawn(async move {
                                if let Some(backend) = registry.get(&backend_id) {
                                    let result = tokio::time::timeout(
                                        Duration::from_secs(15),
                                        backend.respond(&aid2, &event_config, &messages),
                                    ).await;

                                    match result {
                                        Ok(Ok(response)) => {
                                            let mut text = response.content.trim().to_string();
                                            if text.chars().count() > 30 {
                                                text = text.chars().take(27).collect::<String>() + "...";
                                            }
                                            if !text.is_empty() {
                                                log::info!("Event response from {}: {}", aname, text);
                                                let is_emoji = text.chars().count() <= 3;
                                                let duration = if is_emoji { 3.0 } else { 4.5 };
                                                world_ref.push_bubble(&aid, text, is_emoji, duration);
                                            }
                                        }
                                        Ok(Err(e)) => {
                                            log::warn!("Event dispatch to {} failed: {}", aname, e);
                                        }
                                        Err(_) => {
                                            log::warn!("Event dispatch to {} timed out (15s)", aname);
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(world)
        .manage(SplashWait(splash_wait))
        .invoke_handler(tauri::generate_handler![
            get_world_state,
            throw_ball,
            drop_files,
            remove_dropped_file,
            push_bubble,
            speak_sapi,
            click_agent,
            send_message,
            dismiss_chat,
            clear_chat,
            resize_world,
            add_agent,
            remove_agent,
            update_mouse,
            set_gear,
            set_backend_config,
            list_backend_models,
            list_backend_agents,
            rename_agent,
            pick_folder,
            request_attention,
            dismiss_attention,
            save_config,
            load_config,
            load_user_packages,
            read_user_package_file,
            get_splash_wait,
            set_credential,
            get_credential,
            delete_credential,
            has_credential,
            fetch_location,
            fetch_weather,
        ])
        .setup(|app| {
            let win = app.get_webview_window("main").expect("main window");
            if let Ok(Some(monitor)) = win.current_monitor() {
                let scale: f64 = monitor.scale_factor();
                let mw = monitor.size().width as f64 / scale;
                let mh = monitor.size().height as f64 / scale;
                if let Ok(size) = win.outer_size() {
                    let w = size.width as f64 / scale;
                    let h = size.height as f64 / scale;
                    if w > mw || h > mh {
                        let _ = win.set_size(tauri::LogicalSize::new(
                            w.min(mw),
                            h.min(mh),
                        ));
                    }
                }
            }
            start_package_watcher(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    std::process::exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
