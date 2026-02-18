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
   * Each name refers to a built-in draw function OR a custom decorator
   * defined in the `customDecorators` array below.
   * Unknown names are silently skipped.
   */
  decorators: string[];

  /**
   * Custom SVG-path-based decorators defined inline in the theme.
   * Each entry maps a decorator name to a list of SVG path elements,
   * so external package authors can create rich visuals without
   * modifying app code.
   */
  customDecorators?: CustomDecoratorDef[];

  /** Optional lofi 8-bit music configuration */
  music?: ThemeMusic;

  /** If true, dynamic sky (weather/time-of-day) is disabled for this theme */
  disableDynamicSky?: boolean;

  /** If true, no ground/floor is drawn (e.g. outer space) */
  hideGround?: boolean;
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

// ─── Custom Decorators (SVG-path based) ─────────────────────────────

/**
 * A custom decorator defined in JSON using inline SVG path data
 * and/or an external SVG file reference.
 * This allows external package authors to create rich theme visuals
 * (landmarks, structures, scenery) without modifying app code.
 *
 * Use `elements` for inline path data, `file` for an external SVG,
 * or both (file is drawn first, then elements overlay on top).
 */
export interface CustomDecoratorDef {
  /** Name referenced in the theme's `decorators` array */
  name: string;
  /** Ordered list of SVG path elements drawn back-to-front. At least one of `elements` or `file` must be provided. */
  elements?: SvgElement[];
  /**
   * Relative path to an SVG file (e.g. "seattle/space-needle.svg").
   * Resolved relative to the package's base URL (public/packages/ for
   * built-in, ~/agent-terrarium/packages/ for user packages).
   * When provided, the SVG is loaded as an image and drawn on the canvas.
   */
  file?: string;
  /** X position of the file image as a fraction of canvas width (0–1, default: 0.5) */
  fileX?: number;
  /** Y position of the file image as a fraction from top to ground line (0–1, default: 0.5) */
  fileY?: number;
  /** Display width of the file image in px (default: 100) */
  fileWidth?: number;
  /** Display height of the file image in px (default: 100) */
  fileHeight?: number;
  /** Opacity of the file image 0–1 (default: 1) */
  fileOpacity?: number;
  /** Anchor point for vertical positioning: "center" (default) or "bottom" (bottom edge at fileY) */
  fileAnchor?: "center" | "bottom";
  /**
   * Animate the decorator along a path over time.
   * Coordinates are fractions of canvas width (x) and height (y).
   */
  animation?: {
    /** Waypoints as [x, y] pairs (fractions 0–1 of canvas width/height) */
    waypoints: [number, number][];
    /** Duration of one full loop in seconds (default: 30) */
    duration?: number;
    /** If true, reverse direction at the end instead of looping (default: true) */
    pingPong?: boolean;
    /** Seconds between appearances; the decorator is hidden during the gap (default: 0 = always visible) */
    interval?: number;
    /** How long the decorator is visible each appearance in seconds (default: duration) */
    visibleDuration?: number;
    /** Delay in seconds from the start of the interval before the decorator appears (default: 0) */
    delay?: number;
  } | {
    /** Jump animation: parabolic arc with gravity from a surface point */
    type: "jump";
    /** Launch position as [x, y] fraction of canvas (y = water/ground line) */
    origin: [number, number];
    /** Horizontal distance to travel (fraction of canvas width, can be negative) */
    dx: number;
    /** Peak height of the jump (fraction of canvas height, positive = upward) */
    height: number;
    /** Duration of the jump in seconds */
    duration?: number;
    /** Seconds between jumps (default: 30) */
    interval?: number;
    /** Rotate the sprite to follow the arc trajectory */
    rotate?: boolean;
  };
}

/**
 * A single SVG path element positioned on the canvas.
 * Coordinates in the `d` attribute define the shape in local space;
 * `x`/`y` position the shape's origin on the canvas.
 */
export interface SvgElement {
  /** SVG path data string (the `d` attribute) */
  d: string;
  /** Fill color (CSS color string, or "none" to skip fill) */
  fill?: string;
  /** Stroke color */
  stroke?: string;
  /** Stroke width in px (default: 1) */
  strokeWidth?: number;
  /** X position as a fraction of canvas width (0 = left, 1 = right) */
  x: number;
  /** Y position as a fraction from top of canvas to ground line (0 = top, 1 = ground) */
  y: number;
  /** Uniform scale factor applied to the path (default: 1) */
  scale?: number;
  /** Opacity 0–1 (default: 1) */
  opacity?: number;
}

// ─── Agent Avatar ───────────────────────────────────────────────────

export interface AgentDefinition {
  /** Unique avatar id (e.g. "cat", "copilot") */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon for menus */
  icon: string;

  /** Voice profile for Animalese greeting sounds */
  voice: VoiceProfile;

  /**
   * Body shape to use from the built-in shape library.
   * @deprecated Use `drawSpec` instead. Kept for backward compat.
   */
  shape: string;

  /**
   * Declarative draw specification. An ordered list of layers
   * rendered back-to-front. If omitted, falls back to generic shape.
   */
  drawSpec?: DrawSpec;

  /** Default personality values (used when adding a new agent) */
  personality: AgentPersonalityDefaults;

  /** Default backend configuration */
  defaultBackend?: {
    backend_id: string;
    model?: string;
    system_prompt?: string;
    custom_agent?: string;
    awareness_level?: number;
  };
}

export interface VoiceProfile {
  basePitch: number;
  pitchVar: number;
  wave: "sine" | "triangle" | "square" | "sawtooth";
  syllables: number;
  speed: number;
  volume: number;
  /** SAPI speech rate override (-10 to +10). Auto-derived from basePitch if omitted. */
  ttsRate?: number;
  /** Playback rate multiplier override (0.5–3.0). Auto-derived from basePitch if omitted. */
  ttsPitchShift?: number;
}

export interface AgentPersonalityDefaults {
  speedMin: number;
  speedMax: number;
  movementStyle: "wander" | "patrol" | "bounce" | "float";
  interactionChance: number;
  ballInterest: number;
  chatEmojis: string[];
}

// ─── Draw Spec (Data-Driven Avatar Rendering) ──────────────────────

export interface DrawSpec {
  /** Movement mode: "walk" uses legs, "float" bobs without legs (ghost-like) */
  movement?: "walk" | "float";
  /** Body rotation angle (degrees) when walking (penguin waddle = 4) */
  waddleAmount?: number;
  /**
   * SVG file for the avatar body (e.g. "clippy/clippy.svg").
   * Resolved relative to the package's base URL.
   * When provided, the SVG is drawn instead of layer-based rendering.
   * The SVG is centered on the agent position and scaled to fit.
   */
  svgFile?: string;
  /** Display width of the SVG in px (default: 24) */
  svgWidth?: number;
  /** Display height of the SVG in px (default: 32) */
  svgHeight?: number;
  /** Ordered list of visual layers drawn back-to-front (used when svgFile is not set) */
  layers: DrawLayer[];
}

export type DrawLayer =
  | LegsLayer
  | BodyLayer
  | HeadLayer
  | EarsLayer
  | EyesLayer
  | CheeksLayer
  | MouthLayer
  | TailLayer
  | WingsLayer
  | GlowLayer
  | SparklesLayer
  | PatchLayer
  | VisorLayer
  | WhiskersLayer
  | BeakLayer
  | NoseLayer
  | AccessoryLayer
  | GhostBodyLayer;

export interface LegsLayer {
  type: "legs";
  /** Half-distance between legs (default: 5) */
  spread?: number;
  /** Leg length in px (default: 8) */
  length?: number;
  /** Leg color */
  color: string;
  /** Foot style: "round" (default) or "flat" (penguin-like) */
  footStyle?: "round" | "flat";
  /** Foot rx for flat feet (default: 5) */
  footRx?: number;
}

export interface BodyLayer {
  type: "body";
  /** Horizontal radius (default: 10) */
  rx?: number;
  /** Vertical radius (default: 10) */
  ry?: number;
  /** Body fill color */
  color: string;
}

export interface HeadLayer {
  type: "head";
  /** Horizontal radius (default: 10) */
  rx?: number;
  /** Vertical radius (default: 10) */
  ry?: number;
  /** Head fill color */
  color: string;
}

export interface EarsLayer {
  type: "ears";
  /** Ear shape style */
  style: "pointed" | "round" | "comb";
  /** Outer ear color */
  color: string;
  /** Outer ear size (default: 11 for pointed, 4 for round) */
  size?: number;
  /** Inner ear color (default: "#FFAB91") */
  innerColor?: string;
}

export interface EyesLayer {
  type: "eyes";
  /** "standard" uses drawEyes helper with blink; "custom" draws explicit pupils */
  style?: "standard" | "custom";
  /** Eye color (iris/pupil color for standard, whites for custom) */
  color: string;
  /** Eye size (default: 2.5) */
  size?: number;
  /** Pupil color for custom eyes */
  pupilColor?: string;
  /** Eye spacing from center (default: 4) */
  spacing?: number;
}

export interface CheeksLayer {
  type: "cheeks";
  /** Cheek blush color */
  color: string;
}

export interface MouthLayer {
  type: "mouth";
  /** Mouth shape (default: "smile") */
  style?: "smile" | "small" | "o" | "w";
  /** Use different style when moving */
  movingStyle?: "smile" | "small" | "o" | "w";
}

export interface TailLayer {
  type: "tail";
  /** Tail color */
  color: string;
  /** Sway animation speed divisor (lower=faster, default: 200) */
  swaySpeed?: number;
  /** Sway amplitude in px (default: 6) */
  swayAmount?: number;
  /** Tail visual style */
  tailStyle?: "thin" | "fluffy";
  /** Highlight color for fluffy tails (omit to skip) */
  highlightColor?: string;
}

export interface WingsLayer {
  type: "wings";
  /** Wing animation style */
  wingStyle: "flutter" | "flap";
  /** Wing color (CSS color, for flutter use rgba for transparency) */
  color: string;
  /** Animation speed divisor (default: 250 for flutter, 200 for flap) */
  speed?: number;
}

export interface GlowLayer {
  type: "glow";
  /** Glow color (CSS rgba string) */
  color: string;
  /** Glow radius (default: 16) */
  radius?: number;
  /** Pulse animation speed divisor (default: 600) */
  pulseSpeed?: number;
  /** Base alpha (default: 0.08) */
  baseAlpha?: number;
  /** Alpha variation (default: 0.04) */
  alphaVar?: number;
}

export interface SparklesLayer {
  type: "sparkles";
  /** Sparkle animation style */
  sparkleStyle: "star" | "orbit" | "floating";
  /** Sparkle color (CSS color) */
  color: string;
  /** Number of sparkles (default: 1 for star, 3 for orbit, 2 for floating) */
  count?: number;
  /** Animation speed divisor (default varies by style) */
  speed?: number;
}

export interface PatchLayer {
  type: "patch";
  /** Where to draw the patch */
  position: "belly" | "face";
  /** Patch color (default: white-ish) */
  color?: string;
  /** Horizontal radius */
  rx?: number;
  /** Vertical radius */
  ry?: number;
}

export interface VisorLayer {
  type: "visor";
  /** Band color */
  bandColor: string;
  /** Glow gradient colors (default: copilot blue) */
  glowColors?: [string, string, string];
  /** Whether to animate a scan line (default: true) */
  scan?: boolean;
}

export interface WhiskersLayer {
  type: "whiskers";
  /** Number of whisker pairs per side (default: 3) */
  count?: number;
  /** Whisker length (default: 10) */
  length?: number;
}

export interface BeakLayer {
  type: "beak";
  /** Beak color */
  color: string;
}

export interface NoseLayer {
  type: "nose";
  /** Nose color (default: "#5D4037") */
  color?: string;
  /** Nose rx (default: 2) */
  rx?: number;
  /** Nose ry (default: 1.5) */
  ry?: number;
}

export interface AccessoryLayer {
  type: "accessory";
  /** Accessory type */
  accessoryKind: "scarf" | "idle-prop" | "rider";
  /** Primary color */
  color?: string;
  /** For idle-prop: only show when not moving (default: true) */
  idleOnly?: boolean;
  /** For rider: body color */
  riderColor?: string;
  /** For rider: helmet color */
  helmetColor?: string;
  /** For rider: sword color */
  swordColor?: string;
}

export interface GhostBodyLayer {
  type: "ghostBody";
  /** Body fill color */
  color: string;
  /** Number of bottom waves (default: 5) */
  waves?: number;
  /** Wave amplitude (default: 6) */
  waveHeight?: number;
  /** Whether to draw inner shimmer (default: true) */
  shimmer?: boolean;
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
