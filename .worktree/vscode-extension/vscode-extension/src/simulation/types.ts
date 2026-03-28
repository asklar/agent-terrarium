// ── Vec2 ────────────────────────────────────────────────────────────────────

export class Vec2 {
  constructor(public x: number, public y: number) {}

  static new(x: number, y: number): Vec2 {
    return new Vec2(x, y);
  }

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  distanceTo(other: Vec2): number {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
  }

  magnitude(): number {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }

  normalized(): Vec2 {
    const mag = this.magnitude();
    if (mag < Number.EPSILON) {
      return Vec2.zero();
    }
    return new Vec2(this.x / mag, this.y / mag);
  }

  add(rhs: Vec2): Vec2 {
    return new Vec2(this.x + rhs.x, this.y + rhs.y);
  }

  sub(rhs: Vec2): Vec2 {
    return new Vec2(this.x - rhs.x, this.y - rhs.y);
  }

  mul(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }
}

// ── Enums ───────────────────────────────────────────────────────────────────

export enum AgentState {
  Idle = "Idle",
  Walking = "Walking",
  Running = "Running",
  Sprinting = "Sprinting",
  Jumping = "Jumping",
  Crawling = "Crawling",
  Interacting = "Interacting",
  Chatting = "Chatting",
  NeedsAttention = "NeedsAttention",
}

export enum MovementStyle {
  Wander = "Wander",
  Patrol = "Patrol",
  Bounce = "Bounce",
  Float = "Float",
}

export enum Direction {
  Left = "Left",
  Right = "Right",
}

// ── Interfaces / Data Types ─────────────────────────────────────────────────

export interface Personality {
  speedMin: number;
  speedMax: number;
  movementStyle: MovementStyle;
  interactionChance: number;
  ballInterest: number;
  chatEmojis: string[];
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
  stateTimer: number;
  interactionCooldown: number;
  gear: string[];
  backendConfig: BackendConfig;
}

export interface Ball {
  position: Vec2;
  velocity: Vec2;
  active: boolean;
  captures: number;
  height: number;
  heightVelocity: number;
}

export interface DroppedFile {
  id: string;
  /** All files in this drop group: [fileName, filePath] */
  files: [string, string][];
  label: string;
  iconDataUrl: string | null;
  position: Vec2;
  claimedBy: string | null;
  active: boolean;
  height: number;
  heightVelocity: number;
}

export interface ChatBubble {
  agentId: string;
  content: string;
  timer: number;
  isEmoji: boolean;
  isEvent: boolean;
}

export interface ChatMessage {
  fromUser: boolean;
  text: string;
}

export interface ChatSession {
  agentId: string;
  messages: ChatMessage[];
  active: boolean;
}

export interface WorldState {
  agents: Agent[];
  ball: Ball | null;
  droppedFiles: DroppedFile[];
  bubbles: ChatBubble[];
  chatSessions: ChatSession[];
  bounds: Vec2;
  groundYRatio: number;
  tick: number;
  mousePos: Vec2 | null;
  ballMaxCaptures: number;
  ballKickOnCapture: boolean;
  attentionIntervalSecs: number;
  events: TerrariumEvent[];
  pendingFiles: Map<string, [string, string][]>;
}

export interface AgentConfig {
  id: string;
  name: string;
  avatar: string;
  personality: Personality;
  gear: string[];
  backendConfig: BackendConfig;
}

export interface AppConfig {
  theme: string;
  agents: AgentConfig[];
  window?: WindowConfig;
  ballMaxCaptures: number;
  ballKickOnCapture: boolean;
  attentionIntervalSecs: number;
  musicMuted: boolean;
  dynamicSky: boolean;
}

export interface WindowConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackendConfig {
  backendId: string;
  model: string | null;
  awarenessModel: string | null;
  systemPrompt: string | null;
  customAgent: string | null;
  awarenessLevel: number;
  ttsEnabled: boolean;
  cwd: string | null;
}

export function defaultBackendConfig(): BackendConfig {
  return {
    backendId: "echo",
    model: null,
    awarenessModel: null,
    systemPrompt: null,
    customAgent: null,
    awarenessLevel: 0,
    ttsEnabled: false,
    cwd: null,
  };
}

// ── TerrariumEvent ──────────────────────────────────────────────────────────

export type TerrariumEvent =
  | { type: "BallThrown" }
  | { type: "BallCaught"; agentName: string }
  | { type: "BallGone" }
  | { type: "AgentInteraction"; agentA: string; agentB: string; emoji: string }
  | { type: "AgentArrived"; agentName: string }
  | { type: "AgentLeft"; agentName: string }
  | { type: "UserClickedAgent"; agentName: string }
  | { type: "FileDropped"; fileName: string }
  | { type: "FileClaimed"; agentName: string; fileName: string }
  | { type: "AgentNearby"; agentName: string; otherName: string; distance: number };

export function minAwarenessLevel(event: TerrariumEvent): number {
  switch (event.type) {
    case "BallThrown":
      return 1;
    case "BallCaught":
      return 1;
    case "BallGone":
      return 2;
    case "AgentInteraction":
      return 2;
    case "AgentArrived":
      return 1;
    case "AgentLeft":
      return 1;
    case "UserClickedAgent":
      return 1;
    case "FileDropped":
      return 1;
    case "FileClaimed":
      return 1;
    case "AgentNearby":
      return 3;
  }
}

export function toNaturalLanguage(event: TerrariumEvent, observer: string): string {
  switch (event.type) {
    case "BallThrown":
      return "The user threw a ball into the terrarium!";
    case "BallCaught":
      return event.agentName === observer
        ? "You caught the ball!"
        : `${event.agentName} caught the ball.`;
    case "BallGone":
      return "The ball disappeared.";
    case "AgentInteraction":
      if (event.agentA === observer) {
        return `You bumped into ${event.agentB} and exchanged a ${event.emoji} emoji.`;
      } else if (event.agentB === observer) {
        return `${event.agentA} bumped into you and exchanged a ${event.emoji} emoji.`;
      } else {
        return `${event.agentA} and ${event.agentB} bumped into each other (${event.emoji}).`;
      }
    case "AgentArrived":
      return `${event.agentName} just arrived in the terrarium!`;
    case "AgentLeft":
      return `${event.agentName} left the terrarium.`;
    case "UserClickedAgent":
      return event.agentName === observer
        ? "The user clicked on you to start a conversation."
        : `The user started talking to ${event.agentName}.`;
    case "FileDropped":
      return `The user dropped a file into the terrarium: "${event.fileName}"`;
    case "FileClaimed":
      return event.agentName === observer
        ? `You picked up the file "${event.fileName}"!`
        : `${event.agentName} picked up the file "${event.fileName}".`;
    case "AgentNearby":
      return event.agentName === observer
        ? `${event.otherName} is nearby (about ${Math.round(event.distance)}px away).`
        : `${event.agentName} is near ${event.otherName} (about ${Math.round(event.distance)}px away).`;
  }
}
