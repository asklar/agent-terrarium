use serde::{Deserialize, Serialize};

use crate::agents::backend::BackendConfig;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn zero() -> Self {
        Self { x: 0.0, y: 0.0 }
    }

    pub fn distance_to(&self, other: &Vec2) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }

    pub fn magnitude(&self) -> f64 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }

    pub fn normalized(&self) -> Vec2 {
        let mag = self.magnitude();
        if mag < f64::EPSILON {
            Vec2::zero()
        } else {
            Vec2::new(self.x / mag, self.y / mag)
        }
    }
}

impl std::ops::Add for Vec2 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Vec2::new(self.x + rhs.x, self.y + rhs.y)
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Vec2::new(self.x - rhs.x, self.y - rhs.y)
    }
}

impl std::ops::Mul<f64> for Vec2 {
    type Output = Self;
    fn mul(self, rhs: f64) -> Self {
        Vec2::new(self.x * rhs, self.y * rhs)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum AgentState {
    Idle,
    Walking,
    Running,
    Sprinting,
    Jumping,
    Crawling,
    Interacting,
    Chatting,
    NeedsAttention,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MovementStyle {
    Wander,
    Patrol,
    Bounce,
    Float,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Direction {
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Personality {
    pub speed_min: f64,
    pub speed_max: f64,
    pub movement_style: MovementStyle,
    pub interaction_chance: f64,
    pub ball_interest: f64,
    pub chat_emojis: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub position: Vec2,
    pub velocity: Vec2,
    pub state: AgentState,
    pub direction: Direction,
    pub personality: Personality,
    pub target: Option<Vec2>,
    pub state_timer: f64,
    pub interaction_cooldown: f64,
    /// Equipped gear item ids
    #[serde(default)]
    pub gear: Vec<String>,
    /// Backend configuration for this agent
    #[serde(default)]
    pub backend_config: BackendConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ball {
    pub position: Vec2,
    pub velocity: Vec2,
    pub active: bool,
    /// Number of times an agent has captured/kicked this ball
    #[serde(default)]
    pub captures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatBubble {
    pub agent_id: String,
    pub content: String,
    pub timer: f64,
    pub is_emoji: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub from_user: bool,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub agent_id: String,
    pub messages: Vec<ChatMessage>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldState {
    pub agents: Vec<Agent>,
    pub ball: Option<Ball>,
    pub bubbles: Vec<ChatBubble>,
    pub chat_sessions: Vec<ChatSession>,
    pub bounds: Vec2,
    /// Fraction of window height where the ground starts (0.0 = top, 1.0 = bottom)
    pub ground_y_ratio: f64,
    pub tick: u64,
    /// Current mouse position (for hover slowdown). None if mouse is outside window.
    #[serde(skip)]
    pub mouse_pos: Option<Vec2>,
    /// Max captures before ball disappears
    #[serde(default = "default_ball_max_captures")]
    pub ball_max_captures: u32,
    /// Whether the capturing agent kicks the ball away
    #[serde(default = "default_true")]
    pub ball_kick_on_capture: bool,
    /// Seconds between attention sound repeats
    #[serde(default = "default_attention_interval")]
    pub attention_interval_secs: f64,
}

/// Saved agent definition for config persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub personality: Personality,
    /// Equipped gear item ids
    #[serde(default)]
    pub gear: Vec<String>,
    /// Backend configuration for this agent
    #[serde(default)]
    pub backend_config: BackendConfig,
}

/// Persisted app configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub agents: Vec<AgentConfig>,
    #[serde(default)]
    pub window: Option<WindowConfig>,
    /// Max captures before ball disappears (default: 3)
    #[serde(default = "default_ball_max_captures")]
    pub ball_max_captures: u32,
    /// Whether the capturing agent kicks the ball away (default: true)
    #[serde(default = "default_true")]
    pub ball_kick_on_capture: bool,
    /// Seconds between attention sound repeats (default: 5)
    #[serde(default = "default_attention_interval")]
    pub attention_interval_secs: f64,
}

fn default_ball_max_captures() -> u32 { 3 }
fn default_true() -> bool { true }
fn default_attention_interval() -> f64 { 5.0 }

/// Saved window position and size
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
