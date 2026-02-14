/**
 * Agent Terrarium Package Format
 *
 * Packages are declarative JSON manifests that define themes and/or agent avatars.
 * They reference built-in rendering primitives ("decorators" for themes,
 * "body parts" for agents) by name.
 *
 * Packages can be:
 * - Built-in: shipped with the app in src/themes/builtin/
 * - External: loaded from ~/agent-terrarium/packages/*.json
 *
 * The format is designed to be forward-compatible: unknown decorator/part
 * names are silently skipped, so packages created for newer versions
 * degrade gracefully on older ones.
 */

// ─── Package ────────────────────────────────────────────────────────

export interface Package {
  /** Package format version */
  version: 1;
  /** Package display name */
  name: string;
  /** Optional author */
  author?: string;
  /** Themes defined in this package */
  themes?: ThemeDefinition[];
  /** Agent avatars defined in this package */
  agents?: AgentDefinition[];
  /** Gear / accessories defined in this package */
  gear?: GearDefinition[];
}

// ─── Theme ──────────────────────────────────────────────────────────

export interface ThemeDefinition {
  /** Unique identifier (kebab-case, e.g. "forest-dawn") */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon for menus */
  icon: string;

  /** Sky gradient stops (top to bottom, ≥2 colors) */
  sky: string[];
  /** Ground fill color */
  ground: string;
  /** Ground accent / gradient bottom */
  groundAccent: string;
  /** Ground wave amplitude in px (default 4, 0 = flat) */
  groundWave?: number;

  /** Grass tufts (omit to hide) */
  grass?: { color: string; accent: string };

  /** Ambient particle system (omit to disable) */
  particles?: {
    type: ParticleType;
    color: string;
    count: number;
  };

  /**
   * Ordered list of decorators to draw.
   * Each is a built-in draw function name.
   * Unknown names are silently skipped.
   */
  decorators: string[];

  /** Optional lofi 8-bit music configuration */
  music?: ThemeMusic;
}

export interface ThemeMusic {
  /** Tempo in BPM (default: 90) */
  bpm: number;
  /** Musical key root note as MIDI number (e.g. 60 = C4) */
  key: number;
  /** Scale intervals from root (e.g. major pentatonic: [0,2,4,7,9]) */
  scale: number[];
  /** Waveform for melody */
  wave: "sine" | "triangle" | "square" | "sawtooth";
  /** Waveform for bass */
  bassWave: "sine" | "triangle" | "square" | "sawtooth";
  /** Overall volume 0-1 (default: 0.15) */
  volume: number;
  /** Chord progression as arrays of semitone offsets from key (e.g. [[0,4,7],[5,9,12]]) */
  chords: number[][];
}

export type ParticleType = "leaf" | "star" | "sand" | "bubble";

// ─── Agent Avatar ───────────────────────────────────────────────────

export interface AgentDefinition {
  /** Unique avatar id (e.g. "cat", "copilot") */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon for menus */
  icon: string;

  /** Color palette */
  colors: AgentColors;

  /** Voice profile for Animalese greeting sounds */
  voice: VoiceProfile;

  /**
   * Body shape to use from the built-in shape library.
   * The renderer has draw functions keyed by this name.
   * Unknown shapes fall back to "generic".
   */
  shape: string;

  /** Default personality values (used when adding a new agent) */
  personality: AgentPersonalityDefaults;
}

export interface AgentColors {
  body: string;
  head: string;
  eyes: string;
  accent: string;
  cheek: string;
}

export interface VoiceProfile {
  basePitch: number;
  pitchVar: number;
  wave: "sine" | "triangle" | "square" | "sawtooth";
  syllables: number;
  speed: number;
  volume: number;
}

export interface AgentPersonalityDefaults {
  speedMin: number;
  speedMax: number;
  movementStyle: "wander" | "patrol" | "bounce" | "float";
  interactionChance: number;
  ballInterest: number;
  chatEmojis: string[];
}

// ─── Gear / Accessories ─────────────────────────────────────────────

export interface GearDefinition {
  /** Unique gear id (e.g. "top-hat", "red-scarf") */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon for menus */
  icon: string;
  /** Where the gear is worn — determines draw order and anchor point */
  slot: GearSlot;
  /**
   * Built-in draw primitive name for rendering.
   * The renderer has draw functions keyed by this name.
   * Unknown names are silently skipped.
   * If `image` is provided, the image is drawn instead.
   */
  shape: string;
  /** Primary color */
  color: string;
  /** Optional accent color */
  accentColor?: string;
  /**
   * Optional image URL (SVG or PNG with transparency).
   * When provided, the image is drawn instead of the shape primitive.
   * Relative paths are resolved from the package directory.
   */
  image?: string;
  /** Image width in px (default: AGENT_SIZE) */
  imageWidth?: number;
  /** Image height in px (default: AGENT_SIZE) */
  imageHeight?: number;
  /** Vertical offset from the default anchor point (negative = up) */
  imageOffsetY?: number;
}

/**
 * Where gear attaches to the agent sprite.
 * Each slot has a defined anchor point relative to the agent.
 */
export type GearSlot = "hat" | "face" | "neck" | "body" | "back";
