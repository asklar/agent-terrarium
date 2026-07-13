//! Terrarium action tools for awareness event responses.

use async_trait::async_trait;
use github_copilot_sdk::tool::ToolHandler;
use github_copilot_sdk::{Error, Tool, ToolInvocation, ToolResult};
use std::sync::Arc;

use crate::simulation::world::World;

type Handler = Arc<dyn Fn(&str, &serde_json::Value) -> String + Send + Sync>;

struct TerrariumToolHandler {
    handler: Handler,
}

#[async_trait]
impl ToolHandler for TerrariumToolHandler {
    async fn call(&self, invocation: ToolInvocation) -> Result<ToolResult, Error> {
        Ok(ToolResult::Text((self.handler)(
            &invocation.tool_name,
            &invocation.arguments,
        )))
    }
}

fn create_tool(
    name: &str,
    description: &str,
    parameters: serde_json::Value,
    handler: Handler,
) -> Tool {
    Tool::new(name)
        .with_description(description)
        .with_parameters(parameters)
        .with_handler(Arc::new(TerrariumToolHandler { handler }))
}

pub fn create_tools(world: Arc<World>, agent_id: String, agent_name: String) -> Vec<Tool> {
    let world_say = world.clone();
    let agent_id_say = agent_id.clone();
    let agent_name_say = agent_name.clone();
    let say_handler: Handler = Arc::new(move |_name, args| {
        let text = args
            .get("text")
            .and_then(|value| value.as_str())
            .unwrap_or("...")
            .to_string();
        let display = if text.chars().count() > 30 {
            format!("{}...", text.chars().take(27).collect::<String>())
        } else {
            text.clone()
        };
        log::info!("[tool] {} says: \"{}\"", agent_name_say, display);
        world_say.push_bubble(&agent_id_say, display, false, 10.0);
        format!("You said: \"{}\"", text)
    });

    let world_emote = world.clone();
    let agent_id_emote = agent_id.clone();
    let agent_name_emote = agent_name.clone();
    let emote_handler: Handler = Arc::new(move |_name, args| {
        let emoji = args
            .get("emoji")
            .and_then(|value| value.as_str())
            .unwrap_or("😊")
            .to_string();
        log::info!("[tool] {} emotes: {}", agent_name_emote, emoji);
        world_emote.push_bubble(&agent_id_emote, emoji.clone(), true, 3.0);
        format!("You showed: {}", emoji)
    });

    let world_move = world.clone();
    let agent_id_move = agent_id.clone();
    let agent_name_move = agent_name.clone();
    let move_handler: Handler = Arc::new(move |_name, args| {
        let target = args
            .get("target")
            .and_then(|value| value.as_str())
            .unwrap_or("center");
        log::info!("[tool] {} moves toward: {}", agent_name_move, target);
        world_move.move_toward(&agent_id_move, target)
    });

    let world_flee = world;
    let agent_id_flee = agent_id;
    let agent_name_flee = agent_name;
    let flee_handler: Handler = Arc::new(move |_name, args| {
        let from = args
            .get("from")
            .and_then(|value| value.as_str())
            .unwrap_or("ball");
        log::info!("[tool] {} runs from: {}", agent_name_flee, from);
        world_flee.move_away_from(&agent_id_flee, from)
    });

    vec![
        create_tool(
            "say",
            "Say something out loud in a speech bubble. Use for short reactions, greetings, or comments.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "What to say (keep it very short, 1-5 words)"
                    }
                },
                "required": ["text"]
            }),
            say_handler,
        ),
        create_tool(
            "emote",
            "Show an emoji reaction above your head. Use for quick emotional reactions.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "emoji": {
                        "type": "string",
                        "description": "A single emoji to display"
                    }
                },
                "required": ["emoji"]
            }),
            emote_handler,
        ),
        create_tool(
            "move_to",
            "Walk toward something in the terrarium.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "What to move toward: 'ball', 'mouse', 'center', or another agent's name"
                    }
                },
                "required": ["target"]
            }),
            move_handler,
        ),
        create_tool(
            "run_away",
            "Run away from something in the terrarium.",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "from": {
                        "type": "string",
                        "description": "What to run from: 'ball', 'mouse', or another agent's name"
                    }
                },
                "required": ["from"]
            }),
            flee_handler,
        ),
    ]
}
