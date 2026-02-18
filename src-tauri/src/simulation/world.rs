use std::sync::{Arc, Mutex};

use crate::agents::backend::BackendConfig;
use crate::agents::registry::BackendRegistry;
use crate::simulation::types::*;

const TICK_RATE: f64 = 1.0 / 20.0; // 20 ticks/sec
const INTERACTION_DISTANCE: f64 = 60.0;
const INTERACTION_COOLDOWN: f64 = 5.0;
const BALL_FRICTION: f64 = 0.99;
const BALL_MIN_SPEED: f64 = 0.5;
const BALL_GRAVITY: f64 = 400.0; // px/sec² downward
const BALL_BOUNCE_DAMPING: f64 = 0.6;
const WANDER_TARGET_MARGIN: f64 = 10.0;

pub struct World {
    pub state: Mutex<WorldState>,
    pub backend_registry: Arc<BackendRegistry>,
}

impl World {
    pub fn new(bounds: Vec2, backend_registry: Arc<BackendRegistry>) -> Self {
        World {
            state: Mutex::new(WorldState {
                agents: Vec::new(),
                ball: None,
                bubbles: Vec::new(),
                chat_sessions: Vec::new(),
                bounds,
                ground_y_ratio: 0.72,
                tick: 0,
                mouse_pos: None,
                ball_max_captures: 3,
                ball_kick_on_capture: true,
                attention_interval_secs: 5.0,
                events: Vec::new(),
            }),
            backend_registry,
        }
    }

    pub fn tick(&self) {
        let mut state = self.state.lock().unwrap();
        state.tick += 1;

        // Update agents
        let bounds = state.bounds;
        let ground_y = bounds.y * state.ground_y_ratio;
        let agent_count = state.agents.len();

        // Collect agent positions for interaction checks
        let positions: Vec<(String, Vec2)> = state
            .agents
            .iter()
            .map(|a| (a.id.clone(), a.position))
            .collect();

        let mut ball_capture_agent: Option<usize> = None;

        for i in 0..agent_count {
            // Skip agents that are chatting or need attention
            if state.agents[i].state == AgentState::Chatting
                || state.agents[i].state == AgentState::NeedsAttention
            {
                continue;
            }

            // Update cooldowns
            state.agents[i].interaction_cooldown = (state.agents[i].interaction_cooldown - TICK_RATE).max(0.0);
            state.agents[i].state_timer -= TICK_RATE;

            // Check if chasing ball
            let ball_pos = state.ball.as_ref().and_then(|b| {
                if b.active { Some(b.position) } else { None }
            });
            let chasing_ball = if let Some(bp) = ball_pos {
                if state.agents[i].personality.ball_interest > 0.3 {
                    let dir = bp - state.agents[i].position;
                    let dist = dir.magnitude();
                    if dist > 15.0 {
                        let speed = state.agents[i].personality.speed_max * state.agents[i].personality.ball_interest;
                        state.agents[i].velocity = dir.normalized() * speed;
                        state.agents[i].state = AgentState::Running;
                        state.agents[i].direction = if dir.x > 0.0 {
                            Direction::Right
                        } else {
                            Direction::Left
                        };
                        true
                    } else {
                        // Agent reached the ball — record a capture
                        if ball_capture_agent.is_none() {
                            ball_capture_agent = Some(i);
                        }
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            };

            if !chasing_ball && state.agents[i].state != AgentState::Interacting {
                // Wander behavior
                if state.agents[i].target.is_none() || state.agents[i].state_timer <= 0.0 {
                    pick_new_target(&mut state.agents[i], &bounds, ground_y);
                }

                if let Some(target) = state.agents[i].target {
                    let dir = target - state.agents[i].position;
                    let dist = dir.magnitude();
                    if dist < WANDER_TARGET_MARGIN {
                        state.agents[i].target = None;
                        state.agents[i].velocity = Vec2::zero();
                        state.agents[i].state = AgentState::Idle;
                        state.agents[i].state_timer = 1.0 + rand_f64() * 3.0;
                    } else {
                        let speed = state.agents[i].personality.speed_min
                            + rand_f64() * (state.agents[i].personality.speed_max - state.agents[i].personality.speed_min) * 0.5;
                        state.agents[i].velocity = dir.normalized() * speed;
                        state.agents[i].state = AgentState::Walking;
                        state.agents[i].direction = if dir.x > 0.0 {
                            Direction::Right
                        } else {
                            Direction::Left
                        };
                    }
                }
            }

            // Update interaction timer
            if state.agents[i].state == AgentState::Interacting {
                if state.agents[i].state_timer <= 0.0 {
                    state.agents[i].state = AgentState::Idle;
                    state.agents[i].velocity = Vec2::zero();
                    state.agents[i].state_timer = 0.5 + rand_f64() * 1.0;
                } else {
                    state.agents[i].velocity = Vec2::zero();
                    continue;
                }
            }

            // Apply velocity with hover slowdown
            let mouse = state.mouse_pos;
            let mut speed_scale = 1.0;
            if let Some(mp) = mouse {
                let dist = state.agents[i].position.distance_to(&mp);
                let slowdown_radius = 80.0;
                if dist < slowdown_radius {
                    // Smoothly scale from 1.0 at edge to 0.1 at center
                    speed_scale = 0.1 + 0.9 * (dist / slowdown_radius);
                }
            }
            let vel = state.agents[i].velocity * speed_scale;
            state.agents[i].position = state.agents[i].position + vel * TICK_RATE;

            // Bounce off bounds (agents stay on ground surface)
            if state.agents[i].position.x < 16.0 {
                state.agents[i].position.x = 16.0;
                state.agents[i].velocity.x = state.agents[i].velocity.x.abs();
                state.agents[i].direction = Direction::Right;
            }
            if state.agents[i].position.x > bounds.x - 16.0 {
                state.agents[i].position.x = bounds.x - 16.0;
                state.agents[i].velocity.x = -state.agents[i].velocity.x.abs();
                state.agents[i].direction = Direction::Left;
            }
            // Agents walk on the ground plane (ground_y to bounds.y)
            // Ghost can float above ground, others stay on ground plane
            let min_y = if state.agents[i].personality.movement_style == MovementStyle::Float {
                ground_y * 0.3
            } else {
                ground_y
            };
            if state.agents[i].position.y < min_y {
                state.agents[i].position.y = min_y;
                state.agents[i].velocity.y = state.agents[i].velocity.y.abs();
            }
            if state.agents[i].position.y > bounds.y - 16.0 {
                state.agents[i].position.y = bounds.y - 16.0;
                state.agents[i].velocity.y = -state.agents[i].velocity.y.abs();
            }
        }

        // Check agent-agent interactions
        let mut new_bubbles = Vec::new();
        for i in 0..agent_count {
            for j in (i + 1)..agent_count {
                let dist = positions[i].1.distance_to(&positions[j].1);
                if dist < INTERACTION_DISTANCE {
                    if state.agents[i].interaction_cooldown <= 0.0
                        && state.agents[j].interaction_cooldown <= 0.0
                        && state.agents[i].state != AgentState::Chatting
                        && state.agents[j].state != AgentState::Chatting
                        && state.agents[i].state != AgentState::Interacting
                        && state.agents[j].state != AgentState::Interacting
                        && state.agents[i].state != AgentState::NeedsAttention
                        && state.agents[j].state != AgentState::NeedsAttention
                    {
                        let chance = (state.agents[i].personality.interaction_chance
                            + state.agents[j].personality.interaction_chance)
                            / 2.0;
                        if rand_f64() < chance * TICK_RATE {
                            let emoji_a = pick_emoji(&state.agents[i].personality.chat_emojis);
                            let emoji_b = pick_emoji(&state.agents[j].personality.chat_emojis);
                            let id_a = state.agents[i].id.clone();
                            let id_b = state.agents[j].id.clone();
                            let name_a = state.agents[i].name.clone();
                            let name_b = state.agents[j].name.clone();

                            new_bubbles.push(ChatBubble {
                                agent_id: id_a,
                                content: emoji_a.clone(),
                                timer: 2.5,
                                is_emoji: true,
                                is_event: false,
                            });
                            new_bubbles.push(ChatBubble {
                                agent_id: id_b,
                                content: emoji_b,
                                timer: 2.5,
                                is_emoji: true,
                                is_event: false,
                            });

                            state.events.push(TerrariumEvent::AgentInteraction {
                                agent_a: name_a,
                                agent_b: name_b,
                                emoji: emoji_a,
                            });

                            state.agents[i].state = AgentState::Interacting;
                            state.agents[i].state_timer = 2.5;
                            state.agents[i].interaction_cooldown = INTERACTION_COOLDOWN;
                            state.agents[j].state = AgentState::Interacting;
                            state.agents[j].state_timer = 2.5;
                            state.agents[j].interaction_cooldown = INTERACTION_COOLDOWN;
                        }
                    }
                }
            }
        }
        state.bubbles.extend(new_bubbles);

        // Handle ball capture by agent
        if let Some(agent_idx) = ball_capture_agent {
            let max_captures = state.ball_max_captures;
            let kick = state.ball_kick_on_capture;
            let agent_id = state.agents[agent_idx].id.clone();
            let agent_pos = state.agents[agent_idx].position;
            let agent_dir = state.agents[agent_idx].direction;
            let tick = state.tick;
            let mut did_capture = false;
            if let Some(ref mut ball) = state.ball {
                if ball.active {
                    ball.captures += 1;
                    did_capture = true;
                    if ball.captures >= max_captures {
                        ball.active = false;
                    } else if kick {
                        let kick_dir_x = if agent_dir == Direction::Right { 1.0 } else { -1.0 };
                        let variation = ((tick % 7) as f64 - 3.0) * 0.15;
                        let kick_speed = 200.0 + (tick % 5) as f64 * 30.0;
                        ball.velocity = Vec2::new(
                            kick_dir_x * kick_speed * (1.0 + variation),
                            0.0,
                        );
                        ball.position = agent_pos + Vec2::new(kick_dir_x * 20.0, 0.0);
                        ball.height = 10.0;
                        ball.height_velocity = 150.0 + (tick % 4) as f64 * 25.0;
                    }
                }
            }
            if did_capture {
                let agent_name = state.agents[agent_idx].name.clone();
                state.events.push(TerrariumEvent::BallCaught { agent_name: agent_name.clone() });
                // Check if ball disappeared
                if let Some(ref ball) = state.ball {
                    if !ball.active {
                        state.events.push(TerrariumEvent::BallGone);
                    }
                }
                let emojis = ["⚽", "🎉", "😄", "🏆", "💪", "🙌"];
                let emoji = emojis[tick as usize % emojis.len()];
                state.bubbles.push(ChatBubble {
                    agent_id,
                    content: emoji.to_string(),
                    timer: 2.0,
                    is_emoji: true,
                    is_event: false,
                });
            }
        }

        // Update ball physics
        if let Some(ref mut ball) = state.ball {
            if ball.active {
                // Apply gravity to height (not position.y)
                ball.height_velocity -= BALL_GRAVITY * TICK_RATE;
                ball.height += ball.height_velocity * TICK_RATE;

                // Horizontal movement
                ball.position.x += ball.velocity.x * TICK_RATE;
                ball.velocity.x *= BALL_FRICTION;

                // Depth movement (along ground plane)
                ball.position.y += ball.velocity.y * TICK_RATE;
                ball.velocity.y *= BALL_FRICTION;

                // Bounce off left/right walls
                if ball.position.x < 8.0 || ball.position.x > bounds.x - 8.0 {
                    ball.velocity.x = -ball.velocity.x * BALL_BOUNCE_DAMPING;
                    ball.position.x = ball.position.x.clamp(8.0, bounds.x - 8.0);
                }
                // Clamp depth to ground plane
                if ball.position.y < ground_y {
                    ball.position.y = ground_y;
                    ball.velocity.y = ball.velocity.y.abs() * BALL_BOUNCE_DAMPING;
                }
                if ball.position.y > bounds.y - 8.0 {
                    ball.position.y = bounds.y - 8.0;
                    ball.velocity.y = -ball.velocity.y.abs() * BALL_BOUNCE_DAMPING;
                }
                // Bounce off ground (height < 0 while falling)
                if ball.height < 0.0 {
                    ball.height_velocity = ball.height_velocity.abs() * BALL_BOUNCE_DAMPING;
                    ball.height = 0.0;
                    // Extra horizontal friction on ground contact
                    ball.velocity.x *= 0.92;
                    ball.velocity.y *= 0.92;
                }

                let total_speed = (ball.velocity.x.powi(2) + ball.velocity.y.powi(2)).sqrt();
                if total_speed <= BALL_MIN_SPEED && ball.height < 2.0 && ball.height_velocity.abs() <= BALL_MIN_SPEED {
                    ball.active = false;
                    ball.height = 0.0;
                }
            }
        }

        // Remove inactive ball after a while
        if let Some(ref ball) = state.ball {
            if !ball.active {
                // Keep it visible for a bit, then remove
                // (simplified: remove immediately for now)
            }
        }

        // Update bubble timers
        state.bubbles.retain_mut(|bubble| {
            bubble.timer -= TICK_RATE;
            bubble.timer > 0.0
        });
    }

    pub fn get_state(&self) -> WorldState {
        self.state.lock().unwrap().clone()
    }

    pub fn throw_ball(&self, x: f64, y: f64, vx: f64, vy: f64) {
        log::info!("Ball thrown at ({:.0}, {:.0}) vel ({:.0}, {:.0})", x, y, vx, vy);
        let mut state = self.state.lock().unwrap();
        let ground_y = state.bounds.y * state.ground_y_ratio;
        let bounds_y = state.bounds.y;

        if y >= ground_y {
            // Thrown from on the ground plane — ball starts on ground with height
            state.ball = Some(Ball {
                position: Vec2::new(x, y.min(bounds_y - 8.0)),
                velocity: Vec2::new(vx, vy),
                active: true,
                captures: 0,
                height: 10.0,
                height_velocity: 0.0,
            });
        } else {
            // Thrown from above the horizon — pick a landing depth on the ground plane
            // vy > 0 means dragging down (toward ground), which maps to depth
            let depth_y = if vy > 0.0 {
                // The further they drag down, the further into the ground plane
                let ground_range = bounds_y - ground_y;
                let depth_fraction = (vy / 500.0).min(1.0); // normalize drag
                ground_y + depth_fraction * ground_range * 0.8
            } else {
                // Dragging up from above horizon — land near the horizon
                ground_y + 20.0
            };
            let initial_height = ground_y - y;
            state.ball = Some(Ball {
                position: Vec2::new(x, depth_y.min(bounds_y - 8.0)),
                velocity: Vec2::new(vx, 0.0),
                active: true,
                captures: 0,
                height: initial_height + 10.0,
                height_velocity: 0.0,
            });
        }
        state.events.push(TerrariumEvent::BallThrown);
    }

    pub fn click_agent(&self, agent_id: &str) -> bool {
        log::info!("Agent clicked: {}", agent_id);
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            let agent_name = agent.name.clone();
            agent.state = AgentState::Chatting;
            agent.velocity = Vec2::zero();

            // Create or reactivate chat session
            if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
                session.active = true;
            } else {
                state.chat_sessions.push(ChatSession {
                    agent_id: agent_id.to_string(),
                    messages: Vec::new(),
                    active: true,
                });
            }
            state.events.push(TerrariumEvent::UserClickedAgent { agent_name });
            true
        } else {
            false
        }
    }

    pub fn dismiss_chat(&self, agent_id: &str) {
        log::debug!("Chat dismissed: {}", agent_id);
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.state = AgentState::Idle;
            agent.state_timer = 1.0;
        }
        if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
            session.active = false;
        }
    }

    /// Add user message to session and return the agent's backend config.
    /// The actual response generation happens async in the command handler.
    pub fn add_user_message(&self, agent_id: &str, text: &str) -> Option<BackendConfig> {
        log::info!("User message to {}: {}", agent_id, &text[..text.len().min(80)]);
        let mut state = self.state.lock().unwrap();
        let backend_config = state
            .agents
            .iter()
            .find(|a| a.id == agent_id)
            .map(|a| a.backend_config.clone());

        if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
            session.messages.push(ChatMessage {
                from_user: true,
                text: text.to_string(),
            });
        }

        backend_config
    }

    /// Append an assistant response to the chat session.
    pub fn complete_response(&self, agent_id: &str, response: &str) {
        log::info!("Agent {} responded: {}", agent_id, &response[..response.len().min(80)]);
        let mut state = self.state.lock().unwrap();
        if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
            session.messages.push(ChatMessage {
                from_user: false,
                text: response.to_string(),
            });
        }
    }

    /// Get a snapshot of chat messages for an agent (for building backend context).
    pub fn get_chat_messages(&self, agent_id: &str) -> Vec<ChatMessage> {
        let state = self.state.lock().unwrap();
        state
            .chat_sessions
            .iter()
            .find(|s| s.agent_id == agent_id)
            .map(|s| s.messages.clone())
            .unwrap_or_default()
    }

    pub fn get_backend_registry(&self) -> Arc<BackendRegistry> {
        self.backend_registry.clone()
    }

    pub fn send_message(&self, agent_id: &str, text: &str) -> String {
        let mut state = self.state.lock().unwrap();
        if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
            session.messages.push(ChatMessage {
                from_user: true,
                text: text.to_string(),
            });

            // Echo response for now (agent framework placeholder)
            let response = format!("Echo: {}", text);
            session.messages.push(ChatMessage {
                from_user: false,
                text: response.clone(),
            });
            response
        } else {
            "Agent not found".to_string()
        }
    }

    pub fn resize(&self, width: f64, height: f64) {
        let mut state = self.state.lock().unwrap();
        state.bounds = Vec2::new(width, height);
    }

    pub fn add_agent(&self, avatar: &str, name: &str) {
        log::info!("Adding agent: {} ({})", name, avatar);
        let mut state = self.state.lock().unwrap();
        let bounds = state.bounds;
        let ground_y = bounds.y * state.ground_y_ratio;
        let id = format!("{}_{}", avatar, state.tick);
        let agent = create_agent(&id, name, avatar, &bounds, ground_y);
        state.events.push(TerrariumEvent::AgentArrived { agent_name: name.to_string() });
        state.agents.push(agent);
    }

    pub fn remove_agent(&self, agent_id: &str) {
        log::info!("Removing agent: {}", agent_id);
        let mut state = self.state.lock().unwrap();
        let agent_name = state.agents.iter().find(|a| a.id == agent_id).map(|a| a.name.clone());
        if let Some(name) = agent_name {
            state.events.push(TerrariumEvent::AgentLeft { agent_name: name });
        }
        state.agents.retain(|a| a.id != agent_id);
        state.chat_sessions.retain(|s| s.agent_id != agent_id);
        state.bubbles.retain(|b| b.agent_id != agent_id);
    }

    pub fn list_agents(&self) -> Vec<(String, String, String)> {
        let state = self.state.lock().unwrap();
        state.agents.iter().map(|a| (a.id.clone(), a.name.clone(), a.avatar.clone())).collect()
    }

    /// Drain all pending events from the buffer
    pub fn drain_events(&self) -> Vec<TerrariumEvent> {
        let mut state = self.state.lock().unwrap();
        std::mem::take(&mut state.events)
    }

    /// Get agent info needed for event dispatch: (id, name, awareness_level)
    pub fn get_agent_awareness(&self) -> Vec<(String, String, u8)> {
        let state = self.state.lock().unwrap();
        state.agents.iter().map(|a| {
            (a.id.clone(), a.name.clone(), a.backend_config.awareness_level)
        }).collect()
    }

    /// Push a chat bubble onto an agent (used by event dispatcher for reactions)
    pub fn push_bubble(&self, agent_id: &str, content: String, is_emoji: bool, duration: f64) {
        let mut state = self.state.lock().unwrap();
        state.bubbles.push(ChatBubble {
            agent_id: agent_id.to_string(),
            content,
            timer: duration,
            is_emoji,
            is_event: true,
        });
    }

    pub fn update_mouse(&self, x: Option<f64>, y: Option<f64>) {
        let mut state = self.state.lock().unwrap();
        state.mouse_pos = match (x, y) {
            (Some(mx), Some(my)) => Some(Vec2::new(mx, my)),
            _ => None,
        };
    }

    pub fn set_gear(&self, agent_id: &str, gear_ids: Vec<String>) {
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.gear = gear_ids;
        }
        // Gear equip emote
        let emojis = ["✨", "💅", "🎀", "👒", "😎", "🤩"];
        let tick = state.tick as usize;
        let emoji = emojis[tick % emojis.len()];
        state.bubbles.push(ChatBubble {
            agent_id: agent_id.to_string(),
            content: emoji.to_string(),
            timer: 2.0,
            is_emoji: true,
            is_event: false,
        });
    }

    pub fn request_attention(&self, agent_id: &str) {
        log::info!("Attention requested: {}", agent_id);
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.state = AgentState::NeedsAttention;
            agent.velocity = Vec2::zero();
            agent.target = None;
        }
    }

    pub fn dismiss_attention(&self, agent_id: &str) {
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            if agent.state == AgentState::NeedsAttention {
                agent.state = AgentState::Idle;
            }
        }
    }

    pub fn rename_agent(&self, agent_id: &str, name: &str) {
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.name = name.to_string();
        }
    }

    /// Move an agent toward a named target. Returns description of what happened.
    pub fn move_toward(&self, agent_id: &str, target: &str) -> String {
        let mut state = self.state.lock().unwrap();
        let ground_y = state.bounds.y * state.ground_y_ratio;

        // Resolve target position
        let target_pos = match target {
            "ball" => state.ball.as_ref().map(|b| b.position),
            "mouse" | "cursor" => state.mouse_pos,
            "center" => Some(Vec2::new(state.bounds.x / 2.0, ground_y)),
            name => {
                // Find agent by name (case-insensitive)
                state.agents.iter()
                    .find(|a| a.id != agent_id && a.name.eq_ignore_ascii_case(name))
                    .map(|a| a.position)
            }
        };

        match target_pos {
            Some(pos) => {
                if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
                    agent.target = Some(pos);
                    agent.state = if target == "ball" {
                        agent.personality.ball_interest = 1.0;
                        AgentState::Running
                    } else {
                        AgentState::Walking
                    };
                }
                format!("Moving toward {}!", target)
            }
            None => format!("Can't find '{}' to move toward.", target),
        }
    }

    /// Move an agent away from a named target. Returns description of what happened.
    pub fn move_away_from(&self, agent_id: &str, target: &str) -> String {
        let mut state = self.state.lock().unwrap();
        let ground_y = state.bounds.y * state.ground_y_ratio;
        let bounds_x = state.bounds.x;

        // Resolve target position
        let target_pos = match target {
            "ball" => state.ball.as_ref().map(|b| b.position),
            "mouse" | "cursor" => state.mouse_pos,
            name => {
                state.agents.iter()
                    .find(|a| a.id != agent_id && a.name.eq_ignore_ascii_case(name))
                    .map(|a| a.position)
            }
        };

        match target_pos {
            Some(pos) => {
                if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
                    // Move in opposite direction from target
                    let dx = agent.position.x - pos.x;
                    let flee_x = (agent.position.x + dx.signum() * 150.0).clamp(20.0, bounds_x - 20.0);
                    agent.target = Some(Vec2::new(flee_x, ground_y));
                    agent.state = AgentState::Running;
                }
                format!("Running away from {}!", target)
            }
            None => format!("Can't find '{}' to run from.", target),
        }
    }

    /// Get names of other agents (for tool context)
    pub fn get_other_agent_names(&self, agent_id: &str) -> Vec<String> {
        let state = self.state.lock().unwrap();
        state.agents.iter()
            .filter(|a| a.id != agent_id)
            .map(|a| a.name.clone())
            .collect()
    }

    /// Check if a ball currently exists
    pub fn has_ball(&self) -> bool {
        let state = self.state.lock().unwrap();
        state.ball.as_ref().map(|b| b.active).unwrap_or(false)
    }

    pub fn set_backend_config(&self, agent_id: &str, config: BackendConfig) {
        log::info!("Backend config for {}: backend={}", agent_id, config.backend_id);
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.backend_config = config;
        }
    }

    pub fn get_agent_configs(&self) -> Vec<AgentConfig> {
        let state = self.state.lock().unwrap();
        state.agents.iter().map(|a| AgentConfig {
            id: a.id.clone(),
            name: a.name.clone(),
            avatar: a.avatar.clone(),
            personality: a.personality.clone(),
            gear: a.gear.clone(),
            backend_config: a.backend_config.clone(),
        }).collect()
    }

    pub fn load_from_config(&self, config: &AppConfig) {
        log::info!("Loading config: {} agents, theme={}", config.agents.len(), config.theme);
        let mut state = self.state.lock().unwrap();
        let bounds = state.bounds;
        let ground_y = bounds.y * state.ground_y_ratio;
        state.agents.clear();
        state.chat_sessions.clear();
        state.bubbles.clear();
        state.ball_max_captures = config.ball_max_captures;
        state.ball_kick_on_capture = config.ball_kick_on_capture;
        state.attention_interval_secs = config.attention_interval_secs;
        for ac in &config.agents {
            let mut agent = create_agent(&ac.id, &ac.name, &ac.avatar, &bounds, ground_y);
            agent.personality = ac.personality.clone();
            agent.gear = ac.gear.clone();
            agent.backend_config = ac.backend_config.clone();
            state.agents.push(agent);
        }
    }
}

fn create_agent(id: &str, name: &str, avatar: &str, bounds: &Vec2, ground_y: f64) -> Agent {
    // Ground plane ranges from ground_y (horizon) to bounds.y (near viewer)
    let ground_mid = ground_y + (bounds.y - ground_y) * 0.5;
    let (personality, y_pos) = match avatar {
        "cat" => (
            Personality {
                speed_min: 30.0,
                speed_max: 120.0,
                movement_style: MovementStyle::Wander,
                interaction_chance: 0.7,
                ball_interest: 0.9,
                chat_emojis: vec!["😺".into(), "😻".into(), "🐱".into(), "✨".into(), "💕".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
        "copilot" => (
            Personality {
                speed_min: 25.0,
                speed_max: 80.0,
                movement_style: MovementStyle::Patrol,
                interaction_chance: 0.8,
                ball_interest: 0.5,
                chat_emojis: vec!["✨".into(), "💡".into(), "🚀".into(), "💻".into(), "🤝".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
        "squirrel" => (
            Personality {
                speed_min: 50.0,
                speed_max: 180.0,
                movement_style: MovementStyle::Bounce,
                interaction_chance: 0.6,
                ball_interest: 0.8,
                chat_emojis: vec!["🐿️".into(), "🌰".into(), "🍂".into(), "😆".into(), "💨".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
        "penguin" => (
            Personality {
                speed_min: 15.0,
                speed_max: 40.0,
                movement_style: MovementStyle::Wander,
                interaction_chance: 0.5,
                ball_interest: 0.4,
                chat_emojis: vec!["🐧".into(), "❄️".into(), "🧊".into(), "😊".into(), "🐟".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
        "ghost" => (
            Personality {
                speed_min: 10.0,
                speed_max: 50.0,
                movement_style: MovementStyle::Float,
                interaction_chance: 0.2,
                ball_interest: 0.1,
                chat_emojis: vec!["👻".into(), "💀".into(), "🌙".into(), "✨".into(), "😶".into()],
            },
            ground_y * 0.5,
        ),
        "clippy" => (
            Personality {
                speed_min: 20.0,
                speed_max: 60.0,
                movement_style: MovementStyle::Wander,
                interaction_chance: 0.95,
                ball_interest: 0.3,
                chat_emojis: vec!["📎".into(), "💡".into(), "❓".into(), "✨".into(), "👀".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
        _ => (
            Personality {
                speed_min: 20.0,
                speed_max: 80.0,
                movement_style: MovementStyle::Wander,
                interaction_chance: 0.5,
                ball_interest: 0.5,
                chat_emojis: vec!["😊".into(), "👋".into(), "✨".into()],
            },
            ground_mid + rand_f64() * (bounds.y - ground_mid - 32.0),
        ),
    };

    let x_pos = 32.0 + rand_f64() * (bounds.x - 64.0);
    Agent {
        id: id.into(),
        name: name.into(),
        avatar: avatar.into(),
        position: Vec2::new(x_pos, y_pos),
        velocity: Vec2::zero(),
        state: AgentState::Idle,
        direction: if rand_f64() > 0.5 { Direction::Right } else { Direction::Left },
        personality,
        target: None,
        state_timer: 0.0,
        interaction_cooldown: 0.0,
        gear: Vec::new(),
        backend_config: if avatar == "copilot" {
            BackendConfig {
                backend_id: "copilot".to_string(),
                ..BackendConfig::default()
            }
        } else {
            BackendConfig::default()
        },
    }
}

fn pick_new_target(agent: &mut Agent, bounds: &Vec2, ground_y: f64) {
    let margin = 32.0;
    // Float-style agents can go above ground, others walk on the ground plane
    let min_y = if agent.personality.movement_style == MovementStyle::Float {
        ground_y * 0.3
    } else {
        ground_y
    };
    agent.target = Some(Vec2::new(
        margin + rand_f64() * (bounds.x - margin * 2.0),
        min_y + rand_f64() * (bounds.y - min_y - margin),
    ));
    agent.state_timer = 3.0 + rand_f64() * 5.0;
}

fn pick_emoji(emojis: &[String]) -> String {
    if emojis.is_empty() {
        "❓".to_string()
    } else {
        let idx = (rand_f64() * emojis.len() as f64) as usize;
        emojis[idx.min(emojis.len() - 1)].clone()
    }
}

// Simple pseudo-random using thread-local state
fn rand_f64() -> f64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::SystemTime;

    thread_local! {
        static SEED: std::cell::Cell<u64> = std::cell::Cell::new(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64
        );
    }

    SEED.with(|s| {
        let mut hasher = DefaultHasher::new();
        let seed = s.get();
        seed.hash(&mut hasher);
        let new_seed = hasher.finish();
        s.set(new_seed);
        (new_seed & 0xFFFFFFFF) as f64 / 0xFFFFFFFF_u64 as f64
    })
}
