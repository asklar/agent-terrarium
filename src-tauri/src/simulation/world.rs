use std::sync::Mutex;

use crate::simulation::types::*;

const TICK_RATE: f64 = 1.0 / 20.0; // 20 ticks/sec
const INTERACTION_DISTANCE: f64 = 60.0;
const INTERACTION_COOLDOWN: f64 = 5.0;
const BALL_FRICTION: f64 = 0.97;
const BALL_MIN_SPEED: f64 = 0.5;
const WANDER_TARGET_MARGIN: f64 = 10.0;

pub struct World {
    pub state: Mutex<WorldState>,
}

impl World {
    pub fn new(bounds: Vec2) -> Self {
        let agents = create_default_agents(&bounds);
        World {
            state: Mutex::new(WorldState {
                agents,
                ball: None,
                bubbles: Vec::new(),
                chat_sessions: Vec::new(),
                bounds,
                ground_y_ratio: 0.72,
                tick: 0,
                mouse_pos: None,
            }),
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

        for i in 0..agent_count {
            // Skip agents that are chatting with user
            if state.agents[i].state == AgentState::Chatting {
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
            // Ghost can float above ground, others stay on ground
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
                    {
                        let chance = (state.agents[i].personality.interaction_chance
                            + state.agents[j].personality.interaction_chance)
                            / 2.0;
                        if rand_f64() < chance * TICK_RATE {
                            let emoji_a = pick_emoji(&state.agents[i].personality.chat_emojis);
                            let emoji_b = pick_emoji(&state.agents[j].personality.chat_emojis);
                            let id_a = state.agents[i].id.clone();
                            let id_b = state.agents[j].id.clone();

                            new_bubbles.push(ChatBubble {
                                agent_id: id_a,
                                content: emoji_a,
                                timer: 2.5,
                                is_emoji: true,
                            });
                            new_bubbles.push(ChatBubble {
                                agent_id: id_b,
                                content: emoji_b,
                                timer: 2.5,
                                is_emoji: true,
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

        // Update ball physics
        if let Some(ref mut ball) = state.ball {
            if ball.active {
                ball.position = ball.position + ball.velocity * TICK_RATE;
                ball.velocity = ball.velocity * BALL_FRICTION;

                // Bounce off walls
                if ball.position.x < 8.0 || ball.position.x > bounds.x - 8.0 {
                    ball.velocity.x = -ball.velocity.x;
                    ball.position.x = ball.position.x.clamp(8.0, bounds.x - 8.0);
                }
                if ball.position.y < 8.0 || ball.position.y > bounds.y - 8.0 {
                    ball.velocity.y = -ball.velocity.y;
                    ball.position.y = ball.position.y.clamp(8.0, bounds.y - 8.0);
                }

                if ball.velocity.magnitude() < BALL_MIN_SPEED {
                    ball.active = false;
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
        let mut state = self.state.lock().unwrap();
        state.ball = Some(Ball {
            position: Vec2::new(x, y),
            velocity: Vec2::new(vx, vy),
            active: true,
        });
    }

    pub fn click_agent(&self, agent_id: &str) -> bool {
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
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
            true
        } else {
            false
        }
    }

    pub fn dismiss_chat(&self, agent_id: &str) {
        let mut state = self.state.lock().unwrap();
        if let Some(agent) = state.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.state = AgentState::Idle;
            agent.state_timer = 1.0;
        }
        if let Some(session) = state.chat_sessions.iter_mut().find(|s| s.agent_id == agent_id) {
            session.active = false;
        }
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
        let mut state = self.state.lock().unwrap();
        let bounds = state.bounds;
        let ground_y = bounds.y * state.ground_y_ratio;
        let id = format!("{}_{}", avatar, state.tick);
        let agent = create_agent(&id, name, avatar, &bounds, ground_y);
        state.agents.push(agent);
    }

    pub fn remove_agent(&self, agent_id: &str) {
        let mut state = self.state.lock().unwrap();
        state.agents.retain(|a| a.id != agent_id);
        state.chat_sessions.retain(|s| s.agent_id != agent_id);
        state.bubbles.retain(|b| b.agent_id != agent_id);
    }

    pub fn list_agents(&self) -> Vec<(String, String, String)> {
        let state = self.state.lock().unwrap();
        state.agents.iter().map(|a| (a.id.clone(), a.name.clone(), a.avatar.clone())).collect()
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
    }

    pub fn get_agent_configs(&self) -> Vec<AgentConfig> {
        let state = self.state.lock().unwrap();
        state.agents.iter().map(|a| AgentConfig {
            id: a.id.clone(),
            name: a.name.clone(),
            avatar: a.avatar.clone(),
            personality: a.personality.clone(),
            gear: a.gear.clone(),
        }).collect()
    }

    pub fn load_from_config(&self, config: &AppConfig) {
        let mut state = self.state.lock().unwrap();
        let bounds = state.bounds;
        let ground_y = bounds.y * state.ground_y_ratio;
        state.agents.clear();
        state.chat_sessions.clear();
        state.bubbles.clear();
        for ac in &config.agents {
            let mut agent = create_agent(&ac.id, &ac.name, &ac.avatar, &bounds, ground_y);
            agent.personality = ac.personality.clone();
            agent.gear = ac.gear.clone();
            state.agents.push(agent);
        }
    }
}

fn create_agent(id: &str, name: &str, avatar: &str, bounds: &Vec2, ground_y: f64) -> Agent {
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
            ground_y + 20.0,
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
            ground_y + 20.0,
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
            ground_y + 20.0,
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
            ground_y + 20.0,
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
        _ => (
            Personality {
                speed_min: 20.0,
                speed_max: 80.0,
                movement_style: MovementStyle::Wander,
                interaction_chance: 0.5,
                ball_interest: 0.5,
                chat_emojis: vec!["😊".into(), "👋".into(), "✨".into()],
            },
            ground_y + 20.0,
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
    }
}

fn create_default_agents(bounds: &Vec2) -> Vec<Agent> {
    let ground_y = bounds.y * 0.72;
    let defaults = [
        ("cat", "Pixel Cat"),
        ("copilot", "Copilot"),
        ("squirrel", "Squirrel"),
        ("penguin", "Penguin"),
        ("ghost", "Ghost"),
    ];
    defaults
        .iter()
        .enumerate()
        .map(|(i, (avatar, name))| {
            let mut agent = create_agent(avatar, name, avatar, bounds, ground_y);
            // Spread agents evenly for default layout
            agent.position.x = bounds.x * (0.2 + 0.15 * i as f64);
            agent
        })
        .collect()
}

fn pick_new_target(agent: &mut Agent, bounds: &Vec2, ground_y: f64) {
    let margin = 32.0;
    // Float-style agents can go above ground, others stay on ground
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
