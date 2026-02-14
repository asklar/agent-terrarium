export interface Vec2 {
  x: number;
  y: number;
}

export type AgentState =
  | "Idle"
  | "Walking"
  | "Running"
  | "Sprinting"
  | "Jumping"
  | "Crawling"
  | "Interacting"
  | "Chatting"
  | "NeedsAttention";

export type Direction = "Left" | "Right";

export interface Personality {
  speed_min: number;
  speed_max: number;
  movement_style: string;
  interaction_chance: number;
  ball_interest: number;
  chat_emojis: string[];
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  position: Vec2;
  velocity: Vec2;
  state: AgentState;
  direction: Direction;
  personality: Personality;
  target: Vec2 | null;
  state_timer: number;
  interaction_cooldown: number;
  gear: string[];
  backend_config?: {
    backend_id: string;
    model?: string;
    awareness_model?: string;
    system_prompt?: string;
    custom_agent?: string;
    awareness_level: number;
    cwd?: string;
  };
}

export interface Ball {
  position: Vec2;
  velocity: Vec2;
  active: boolean;
  captures: number;
}

export interface ChatBubble {
  agent_id: string;
  content: string;
  timer: number;
  is_emoji: boolean;
  is_event?: boolean;
}

export interface ChatMessage {
  from_user: boolean;
  text: string;
}

export interface ChatSession {
  agent_id: string;
  messages: ChatMessage[];
  active: boolean;
}

export interface WorldState {
  agents: Agent[];
  ball: Ball | null;
  bubbles: ChatBubble[];
  chat_sessions: ChatSession[];
  bounds: Vec2;
  ground_y_ratio: number;
  tick: number;
  attention_interval_secs: number;
}
