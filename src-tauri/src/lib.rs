mod agents;
mod simulation;

use tauri::Manager;
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
fn click_agent(world: tauri::State<'_, Arc<World>>, agent_id: String) -> bool {
    world.click_agent(&agent_id)
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
        .respond(&backend_config, &messages)
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

    // Request attention so the user knows there's a reply
    if response.needs_attention || backend_config.backend_id != "echo" {
        world.request_attention(&agent_id);
    }

    Ok(response.content)
}

#[tauri::command]
fn dismiss_chat(world: tauri::State<'_, Arc<World>>, agent_id: String) {
    world.dismiss_chat(&agent_id);
}

#[tauri::command]
fn resize_world(world: tauri::State<'_, Arc<World>>, width: f64, height: f64) {
    world.resize(width, height);
}

#[tauri::command]
fn add_agent(world: tauri::State<'_, Arc<World>>, avatar: String, name: String) {
    world.add_agent(&avatar, &name);
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
        }
    }
    Ok(packages)
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

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(world)
        .manage(SplashWait(splash_wait))
        .invoke_handler(tauri::generate_handler![
            get_world_state,
            throw_ball,
            click_agent,
            send_message,
            dismiss_chat,
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
            get_splash_wait,
            set_credential,
            get_credential,
            delete_credential,
            has_credential,
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
