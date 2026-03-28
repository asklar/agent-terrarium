//! Terrarium action tools for awareness event responses.
//!
//! These tools are registered on Copilot SDK sessions so the model can
//! choose actions (say, emote, move_to, run_away) instead of plain text.

use std::sync::Arc;

use crate::simulation::world::World;

/// Define all terrarium action tools as JSON for the Go bridge.
pub fn define_tools_json() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "name": "say",
            "description": "Say something out loud in a speech bubble. Use for short reactions, greetings, or comments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": { "type": "string", "description": "What to say (keep it very short, 1-5 words)" }
                },
                "required": ["text"]
            }
        }),
        serde_json::json!({
            "name": "emote",
            "description": "Show an emoji reaction above your head. Use for quick emotional reactions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "emoji": { "type": "string", "description": "A single emoji to display" }
                },
                "required": ["emoji"]
            }
        }),
        serde_json::json!({
            "name": "move_to",
            "description": "Walk toward something in the terrarium.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": { "type": "string", "description": "What to move toward: 'ball', 'mouse', 'center', or another agent's name" }
                },
                "required": ["target"]
            }
        }),
        serde_json::json!({
            "name": "run_away",
            "description": "Run away from something in the terrarium.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from": { "type": "string", "description": "What to run from: 'ball', 'mouse', or another agent's name" }
                },
                "required": ["from"]
            }
        }),
    ]
}

/// Create tool handlers that interact with the World.
/// Returns a list of (tool_name, handler) pairs where handler returns a String result.
pub fn create_handlers(
    world: Arc<World>,
    agent_id: String,
    agent_name: String,
) -> Vec<(String, Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync>)> {
    let world_say = world.clone();
    let aid_say = agent_id.clone();
    let aname_say = agent_name.clone();
    let say_handler: Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync> =
        Arc::new(move |_name, args| {
            let text = args
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("...")
                .to_string();
            let display = if text.chars().count() > 30 {
                format!("{}...", text.chars().take(27).collect::<String>())
            } else {
                text.clone()
            };
            log::info!("[tool] {} says: \"{}\"", aname_say, display);
            world_say.push_bubble(&aid_say, display, false, 10.0);
            format!("You said: \"{}\"", text)
        });

    let world_emote = world.clone();
    let aid_emote = agent_id.clone();
    let aname_emote = agent_name.clone();
    let emote_handler: Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync> =
        Arc::new(move |_name, args| {
            let emoji = args
                .get("emoji")
                .and_then(|v| v.as_str())
                .unwrap_or("😊")
                .to_string();
            log::info!("[tool] {} emotes: {}", aname_emote, emoji);
            world_emote.push_bubble(&aid_emote, emoji.clone(), true, 3.0);
            format!("You showed: {}", emoji)
        });

    let world_move = world.clone();
    let aid_move = agent_id.clone();
    let aname_move = agent_name.clone();
    let move_handler: Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync> =
        Arc::new(move |_name, args| {
            let target = args
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("center");
            log::info!("[tool] {} moves toward: {}", aname_move, target);
            world_move.move_toward(&aid_move, target)
        });

    let world_flee = world.clone();
    let aid_flee = agent_id.clone();
    let aname_flee = agent_name.clone();
    let flee_handler: Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync> =
        Arc::new(move |_name, args| {
            let from = args
                .get("from")
                .and_then(|v| v.as_str())
                .unwrap_or("ball");
            log::info!("[tool] {} runs from: {}", aname_flee, from);
            world_flee.move_away_from(&aid_flee, from)
        });

    vec![
        ("say".to_string(), say_handler),
        ("emote".to_string(), emote_handler),
        ("move_to".to_string(), move_handler),
        ("run_away".to_string(), flee_handler),
    ]
}
