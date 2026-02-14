mod agents;
mod simulation;

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
fn send_message(world: tauri::State<'_, Arc<World>>, agent_id: String, text: String) -> String {
    world.send_message(&agent_id, &text)
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

fn config_path() -> std::path::PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("agent-terrarium.json");
    path
}

#[tauri::command]
fn save_config(theme: String, world: tauri::State<'_, Arc<World>>) -> Result<(), String> {
    let agents = world.get_agent_configs();
    let config = AppConfig { theme, agents };
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let world = Arc::new(World::new(Vec2::new(800.0, 400.0)));

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
        .plugin(tauri_plugin_opener::init())
        .manage(world)
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
            save_config,
            load_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
