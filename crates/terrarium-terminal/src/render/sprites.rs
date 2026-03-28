//! Pixel art sprite definitions for Sixel rendering
//!
//! Each sprite is 16x16 pixels, stored as RGBA values.
//! Colors are derived from the agents.json drawSpec.

use terrarium_sim::{AgentState, Direction};

/// RGBA pixel type
pub type Pixel = [u8; 4];

/// Transparent pixel
pub const TRANSPARENT: Pixel = [0, 0, 0, 0];

/// A 16x16 sprite frame
pub struct PixelSprite {
    pub pixels: [[Pixel; 16]; 16],
    pub width: u8,
    pub height: u8,
}

impl PixelSprite {
    pub const fn new(pixels: [[Pixel; 16]; 16]) -> Self {
        Self {
            pixels,
            width: 16,
            height: 16,
        }
    }
}

/// Get pixel sprite for an agent
pub fn get_pixel_sprite(
    avatar: &str,
    state: AgentState,
    direction: Direction,
    frame: usize,
) -> &'static PixelSprite {
    match avatar {
        "cat" => cat_sprite(state, direction, frame),
        "copilot" => copilot_sprite(state, direction, frame),
        "squirrel" => squirrel_sprite(state, direction, frame),
        "penguin" => penguin_sprite(state, direction, frame),
        "ghost" => ghost_sprite(state, direction, frame),
        "clippy" => clippy_sprite(state, direction, frame),
        _ => default_sprite(state, direction, frame),
    }
}

// =============================================================================
// COLOR DEFINITIONS (from agents.json)
// =============================================================================

// Cat colors
const CAT_ORANGE: Pixel = [0xFF, 0x98, 0x00, 0xFF];       // #FF9800 body
const CAT_DARK_ORANGE: Pixel = [0xE6, 0x51, 0x00, 0xFF];  // #E65100 legs/tail
const CAT_HEAD: Pixel = [0xFF, 0xB7, 0x4D, 0xFF];         // #FFB74D head
const CAT_INNER_EAR: Pixel = [0xFF, 0xAB, 0x91, 0xFF];    // #FFAB91 inner ear
const CAT_CHEEK: Pixel = [0xFF, 0x8A, 0x80, 0xFF];        // #FF8A80 cheeks
const CAT_EYE: Pixel = [0x33, 0x33, 0x33, 0xFF];          // #333333 eyes

// Copilot colors
const COPILOT_BODY: Pixel = [0x1F, 0x6F, 0xEB, 0xFF];     // #1F6FEB body
const COPILOT_HEAD: Pixel = [0x58, 0xA6, 0xFF, 0xFF];     // #58A6FF head
const COPILOT_VISOR: Pixel = [0x0D, 0x11, 0x17, 0xFF];    // #0D1117 visor
const COPILOT_LEGS: Pixel = [0x0D, 0x11, 0x17, 0xFF];     // #0D1117 legs
const COPILOT_CHEEK: Pixel = [0x90, 0xCA, 0xF9, 0xFF];    // #90CAF9 cheeks

// Squirrel colors
const SQUIRREL_BODY: Pixel = [0x8D, 0x6E, 0x63, 0xFF];    // #8D6E63 body
const SQUIRREL_BELLY: Pixel = [0xA1, 0x88, 0x7F, 0xFF];   // #A1887F belly/highlight
const SQUIRREL_LEGS: Pixel = [0x5D, 0x40, 0x37, 0xFF];    // #5D4037 legs
const SQUIRREL_CHEEK: Pixel = [0xFF, 0xAB, 0x91, 0xFF];   // #FFAB91 cheeks
const SQUIRREL_EYE: Pixel = [0x33, 0x33, 0x33, 0xFF];     // #333333 eyes

// Penguin colors
const PENGUIN_BODY: Pixel = [0x37, 0x47, 0x4F, 0xFF];     // #37474F body
const PENGUIN_HEAD: Pixel = [0x45, 0x5A, 0x64, 0xFF];     // #455A64 head
const PENGUIN_BELLY: Pixel = [0xEC, 0xEF, 0xF1, 0xFF];    // #ECEFF1 belly
const PENGUIN_BEAK: Pixel = [0xFF, 0x98, 0x00, 0xFF];     // #FF9800 beak/feet
const PENGUIN_SCARF: Pixel = [0xE5, 0x39, 0x35, 0xFF];    // #E53935 scarf
const PENGUIN_CHEEK: Pixel = [0xF4, 0x8F, 0xB1, 0xFF];    // #F48FB1 cheeks

// Ghost colors
const GHOST_BODY: Pixel = [0xE8, 0xEA, 0xF6, 0xFF];       // #E8EAF6 body
const GHOST_GLOW: Pixel = [0xC8, 0xC8, 0xFF, 0x30];       // rgba glow
const GHOST_EYE: Pixel = [0x7E, 0x57, 0xC2, 0xFF];        // #7E57C2 eyes
const GHOST_PUPIL: Pixel = [0x4A, 0x14, 0x8C, 0xFF];      // #4A148C pupil
const GHOST_SPARKLE: Pixel = [0xCE, 0x93, 0xD8, 0xFF];    // #CE93D8 sparkles

// Clippy colors
const CLIPPY_GOLD: Pixel = [0xFF, 0xD7, 0x00, 0xFF];      // #FFD700 gold
const CLIPPY_DARK: Pixel = [0xB8, 0x96, 0x00, 0xFF];      // darker gold
const CLIPPY_EYE: Pixel = [0x00, 0x00, 0x00, 0xFF];       // black

// Default colors
const DEFAULT_GRAY: Pixel = [0x80, 0x80, 0x80, 0xFF];
const DEFAULT_DARK: Pixel = [0x60, 0x60, 0x60, 0xFF];
const WHITE: Pixel = [0xFF, 0xFF, 0xFF, 0xFF];
const BLACK: Pixel = [0x00, 0x00, 0x00, 0xFF];

// =============================================================================
// CAT SPRITE (16x16)
// =============================================================================

const CAT_IDLE_1: PixelSprite = PixelSprite::new(make_cat_sprite(false, false));
const CAT_IDLE_2: PixelSprite = PixelSprite::new(make_cat_sprite(true, false));
const CAT_WALK_1: PixelSprite = PixelSprite::new(make_cat_walk_sprite(false));
const CAT_WALK_2: PixelSprite = PixelSprite::new(make_cat_walk_sprite(true));

const fn make_cat_sprite(blink: bool, tail_up: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let o = CAT_ORANGE;
    let d = CAT_DARK_ORANGE;
    let h = CAT_HEAD;
    let i = CAT_INNER_EAR;
    let c = CAT_CHEEK;
    let e = if blink { CAT_HEAD } else { CAT_EYE };
    let _ = tail_up;

    [
        //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
        [t, t, t, h, t, t, t, t, t, t, t, t, h, t, t, t], // 0 - ears
        [t, t, h, i, h, t, t, t, t, t, t, h, i, h, t, t], // 1 - ears
        [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t], // 2 - top head
        [t, t, h, h, h, h, h, h, h, h, h, h, h, h, t, t], // 3 - head
        [t, t, h, h, e, h, h, h, h, h, h, e, h, h, t, t], // 4 - eyes
        [t, t, h, c, h, h, h, h, h, h, h, h, c, h, t, t], // 5 - cheeks
        [t, t, t, h, h, h, h, d, h, h, h, h, h, t, t, t], // 6 - nose
        [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t], // 7 - mouth
        [t, t, t, t, o, o, o, o, o, o, o, o, t, t, t, t], // 8 - neck
        [t, t, t, o, o, o, o, o, o, o, o, o, o, t, t, t], // 9 - body
        [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t], // 10 - body
        [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t], // 11 - body
        [t, d, o, o, o, o, o, o, o, o, o, o, o, o, d, t], // 12 - tail & body
        [d, d, t, d, d, t, t, t, t, t, t, d, d, t, d, d], // 13 - legs
        [d, d, t, d, d, t, t, t, t, t, t, d, d, t, d, d], // 14 - legs
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t], // 15
    ]
}

const fn make_cat_walk_sprite(step: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let o = CAT_ORANGE;
    let d = CAT_DARK_ORANGE;
    let h = CAT_HEAD;
    let i = CAT_INNER_EAR;
    let c = CAT_CHEEK;
    let e = CAT_EYE;

    if step {
        [
            [t, t, t, h, t, t, t, t, t, t, t, t, h, t, t, t],
            [t, t, h, i, h, t, t, t, t, t, t, h, i, h, t, t],
            [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
            [t, t, h, h, h, h, h, h, h, h, h, h, h, h, t, t],
            [t, t, h, h, e, h, h, h, h, h, h, e, h, h, t, t],
            [t, t, h, c, h, h, h, h, h, h, h, h, c, h, t, t],
            [t, t, t, h, h, h, h, d, h, h, h, h, h, t, t, t],
            [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
            [t, t, t, t, o, o, o, o, o, o, o, o, t, t, t, t],
            [t, t, t, o, o, o, o, o, o, o, o, o, o, t, t, t],
            [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t],
            [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t],
            [d, d, o, o, o, o, o, o, o, o, o, o, o, o, t, t],
            [d, d, d, t, d, d, t, t, t, t, t, t, d, d, t, t],
            [t, t, d, t, d, d, t, t, t, t, t, t, d, d, t, t],
            [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        ]
    } else {
        [
            [t, t, t, h, t, t, t, t, t, t, t, t, h, t, t, t],
            [t, t, h, i, h, t, t, t, t, t, t, h, i, h, t, t],
            [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
            [t, t, h, h, h, h, h, h, h, h, h, h, h, h, t, t],
            [t, t, h, h, e, h, h, h, h, h, h, e, h, h, t, t],
            [t, t, h, c, h, h, h, h, h, h, h, h, c, h, t, t],
            [t, t, t, h, h, h, h, d, h, h, h, h, h, t, t, t],
            [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
            [t, t, t, t, o, o, o, o, o, o, o, o, t, t, t, t],
            [t, t, t, o, o, o, o, o, o, o, o, o, o, t, t, t],
            [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t],
            [t, t, o, o, o, o, o, o, o, o, o, o, o, o, t, t],
            [t, t, o, o, o, o, o, o, o, o, o, o, o, o, d, d],
            [t, t, d, d, t, t, t, t, t, t, d, d, t, d, d, d],
            [t, t, d, d, t, t, t, t, t, t, d, d, t, d, t, t],
            [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        ]
    }
}

fn cat_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 4 == 3 {
                &CAT_IDLE_2 // blink
            } else {
                &CAT_IDLE_1
            }
        }
        AgentState::Walking | AgentState::Running => {
            if frame % 2 == 0 {
                &CAT_WALK_1
            } else {
                &CAT_WALK_2
            }
        }
        _ => &CAT_IDLE_1,
    }
}

// =============================================================================
// COPILOT SPRITE (16x16)
// =============================================================================

const COPILOT_IDLE_1: PixelSprite = PixelSprite::new(make_copilot_sprite(false));
const COPILOT_IDLE_2: PixelSprite = PixelSprite::new(make_copilot_sprite(true));

const fn make_copilot_sprite(blink: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let b = COPILOT_BODY;
    let h = COPILOT_HEAD;
    let v = COPILOT_VISOR;
    let l = COPILOT_LEGS;
    let c = COPILOT_CHEEK;
    let e = if blink { COPILOT_HEAD } else { WHITE };

    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, h, h, h, h, h, h, t, t, t, t, t],
        [t, t, t, t, h, h, h, h, h, h, h, h, t, t, t, t],
        [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
        [t, t, t, h, h, e, h, h, h, h, e, h, h, t, t, t],
        [t, t, t, h, c, h, h, h, h, h, h, c, h, t, t, t],
        [t, t, t, v, v, v, v, v, v, v, v, v, v, t, t, t],
        [t, t, t, h, h, h, h, h, h, h, h, h, h, t, t, t],
        [t, t, t, t, b, b, b, b, b, b, b, b, t, t, t, t],
        [t, t, t, b, b, b, b, b, b, b, b, b, b, t, t, t],
        [t, t, b, b, b, b, b, b, b, b, b, b, b, b, t, t],
        [t, t, b, b, b, b, b, b, b, b, b, b, b, b, t, t],
        [t, t, t, b, b, b, b, b, b, b, b, b, b, t, t, t],
        [t, t, t, t, l, l, t, t, t, t, l, l, t, t, t, t],
        [t, t, t, t, l, l, t, t, t, t, l, l, t, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn copilot_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 4 == 3 {
                &COPILOT_IDLE_2
            } else {
                &COPILOT_IDLE_1
            }
        }
        _ => &COPILOT_IDLE_1,
    }
}

// =============================================================================
// SQUIRREL SPRITE (16x16)
// =============================================================================

const SQUIRREL_IDLE_1: PixelSprite = PixelSprite::new(make_squirrel_sprite(false));
const SQUIRREL_IDLE_2: PixelSprite = PixelSprite::new(make_squirrel_sprite(true));

const fn make_squirrel_sprite(blink: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let b = SQUIRREL_BODY;
    let y = SQUIRREL_BELLY;
    let l = SQUIRREL_LEGS;
    let c = SQUIRREL_CHEEK;
    let e = if blink { SQUIRREL_BELLY } else { SQUIRREL_EYE };

    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, b, b, t],
        [t, t, t, t, b, t, t, t, t, t, t, t, b, b, b, b],
        [t, t, t, b, b, b, t, t, t, t, t, t, t, b, b, b],
        [t, t, b, b, b, b, b, t, t, t, t, t, t, t, b, b],
        [t, t, b, b, e, b, b, t, t, t, t, t, t, t, b, t],
        [t, t, b, c, b, b, b, t, t, t, t, t, t, t, t, t],
        [t, t, t, b, b, l, b, t, t, t, t, t, t, t, t, t],
        [t, t, t, b, b, b, b, b, t, t, t, t, t, t, t, t],
        [t, t, t, t, b, b, b, b, b, t, t, t, t, t, t, t],
        [t, t, t, b, b, y, y, y, b, b, t, t, t, t, t, t],
        [t, t, t, b, b, y, y, y, b, b, t, t, t, t, t, t],
        [t, t, t, b, b, b, b, b, b, b, t, t, t, t, t, t],
        [t, t, t, t, b, b, b, b, b, t, t, t, t, t, t, t],
        [t, t, t, t, l, l, t, l, l, t, t, t, t, t, t, t],
        [t, t, t, t, l, l, t, l, l, t, t, t, t, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn squirrel_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 3 == 2 {
                &SQUIRREL_IDLE_2
            } else {
                &SQUIRREL_IDLE_1
            }
        }
        _ => &SQUIRREL_IDLE_1,
    }
}

// =============================================================================
// PENGUIN SPRITE (16x16)
// =============================================================================

const PENGUIN_IDLE_1: PixelSprite = PixelSprite::new(make_penguin_sprite(false, false));
const PENGUIN_IDLE_2: PixelSprite = PixelSprite::new(make_penguin_sprite(true, false));
const PENGUIN_WALK_1: PixelSprite = PixelSprite::new(make_penguin_sprite(false, false));
const PENGUIN_WALK_2: PixelSprite = PixelSprite::new(make_penguin_waddle_sprite());

const fn make_penguin_sprite(blink: bool, _waddle: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let b = PENGUIN_BODY;
    let h = PENGUIN_HEAD;
    let y = PENGUIN_BELLY;
    let k = PENGUIN_BEAK;
    let s = PENGUIN_SCARF;
    let c = PENGUIN_CHEEK;
    let e = if blink { PENGUIN_HEAD } else { BLACK };

    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, h, h, h, h, h, h, t, t, t, t, t],
        [t, t, t, t, h, h, h, h, h, h, h, h, t, t, t, t],
        [t, t, t, h, h, y, y, y, y, y, y, h, h, t, t, t],
        [t, t, t, h, y, e, y, y, y, y, e, y, h, t, t, t],
        [t, t, t, h, y, c, y, k, k, y, c, y, h, t, t, t],
        [t, t, t, h, h, y, y, y, y, y, y, h, h, t, t, t],
        [t, t, t, t, s, s, s, s, s, s, s, s, t, t, t, t],
        [t, t, t, b, b, y, y, y, y, y, y, b, b, t, t, t],
        [t, t, b, b, b, y, y, y, y, y, y, b, b, b, t, t],
        [t, b, b, b, b, y, y, y, y, y, y, b, b, b, b, t],
        [t, b, b, b, b, y, y, y, y, y, y, b, b, b, b, t],
        [t, t, b, b, b, b, y, y, y, y, b, b, b, b, t, t],
        [t, t, t, t, b, b, b, b, b, b, b, b, t, t, t, t],
        [t, t, t, t, k, k, k, t, t, k, k, k, t, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

const fn make_penguin_waddle_sprite() -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let b = PENGUIN_BODY;
    let h = PENGUIN_HEAD;
    let y = PENGUIN_BELLY;
    let k = PENGUIN_BEAK;
    let s = PENGUIN_SCARF;
    let c = PENGUIN_CHEEK;
    let e = BLACK;

    // Slightly tilted for waddle effect
    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, t, h, h, h, h, h, h, t, t, t, t],
        [t, t, t, t, t, h, h, h, h, h, h, h, h, t, t, t],
        [t, t, t, t, h, h, y, y, y, y, y, y, h, h, t, t],
        [t, t, t, t, h, y, e, y, y, y, y, e, y, h, t, t],
        [t, t, t, t, h, y, c, y, k, k, y, c, y, h, t, t],
        [t, t, t, t, h, h, y, y, y, y, y, y, h, h, t, t],
        [t, t, t, t, t, s, s, s, s, s, s, s, s, t, t, t],
        [t, t, t, t, b, b, y, y, y, y, y, y, b, b, t, t],
        [t, t, t, b, b, b, y, y, y, y, y, y, b, b, b, t],
        [t, t, b, b, b, b, y, y, y, y, y, y, b, b, b, b],
        [t, t, b, b, b, b, y, y, y, y, y, y, b, b, b, b],
        [t, t, t, b, b, b, b, y, y, y, y, b, b, b, b, t],
        [t, t, t, t, t, b, b, b, b, b, b, b, b, t, t, t],
        [t, t, t, t, k, k, k, t, t, t, k, k, k, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn penguin_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 3 == 2 {
                &PENGUIN_IDLE_2
            } else {
                &PENGUIN_IDLE_1
            }
        }
        AgentState::Walking | AgentState::Running => {
            if frame % 2 == 0 {
                &PENGUIN_WALK_1
            } else {
                &PENGUIN_WALK_2
            }
        }
        _ => &PENGUIN_IDLE_1,
    }
}

// =============================================================================
// GHOST SPRITE (16x16)
// =============================================================================

const GHOST_IDLE_1: PixelSprite = PixelSprite::new(make_ghost_sprite(false, 0));
const GHOST_IDLE_2: PixelSprite = PixelSprite::new(make_ghost_sprite(true, 0));
const GHOST_FLOAT_1: PixelSprite = PixelSprite::new(make_ghost_sprite(false, 1));
const GHOST_FLOAT_2: PixelSprite = PixelSprite::new(make_ghost_sprite(false, 2));

const fn make_ghost_sprite(blink: bool, float_offset: u8) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let b = GHOST_BODY;
    let g = GHOST_GLOW;
    let e = if blink { GHOST_BODY } else { GHOST_EYE };
    let p = if blink { GHOST_BODY } else { GHOST_PUPIL };
    let s = GHOST_SPARKLE;
    let _ = float_offset;

    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, g, g, g, g, g, g, t, t, t, s, t],
        [t, t, t, t, g, b, b, b, b, b, b, g, t, t, t, t],
        [t, t, t, g, b, b, b, b, b, b, b, b, g, t, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, g, b, b, e, e, b, b, e, e, b, b, g, t, t],
        [t, t, g, b, b, e, p, b, b, e, p, b, b, g, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, g, b, b, b, b, b, b, b, b, b, b, g, t, t],
        [t, t, t, b, b, t, b, b, t, b, b, t, b, t, t, t],
        [t, t, t, b, t, t, b, t, t, b, t, t, b, t, t, t],
        [t, s, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn ghost_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 3 == 2 {
                &GHOST_IDLE_2
            } else {
                &GHOST_IDLE_1
            }
        }
        AgentState::Walking | AgentState::Running => {
            if frame % 2 == 0 {
                &GHOST_FLOAT_1
            } else {
                &GHOST_FLOAT_2
            }
        }
        _ => &GHOST_IDLE_1,
    }
}

// =============================================================================
// CLIPPY SPRITE (16x16)
// =============================================================================

const CLIPPY_IDLE_1: PixelSprite = PixelSprite::new(make_clippy_sprite(false));
const CLIPPY_IDLE_2: PixelSprite = PixelSprite::new(make_clippy_sprite(true));

const fn make_clippy_sprite(blink: bool) -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let g = CLIPPY_GOLD;
    let d = CLIPPY_DARK;
    let e = if blink { CLIPPY_GOLD } else { CLIPPY_EYE };
    let w = WHITE;

    [
        [t, t, t, t, t, t, g, g, g, g, t, t, t, t, t, t],
        [t, t, t, t, t, g, g, g, g, g, g, t, t, t, t, t],
        [t, t, t, t, t, g, g, g, g, g, g, t, t, t, t, t],
        [t, t, t, t, g, g, e, g, g, e, g, g, t, t, t, t],
        [t, t, t, t, g, g, w, g, g, w, g, g, t, t, t, t],
        [t, t, t, t, g, g, g, g, g, g, g, g, t, t, t, t],
        [t, t, t, t, g, g, g, g, g, g, g, g, t, t, t, t],
        [t, t, t, t, t, g, g, g, g, g, g, t, t, t, t, t],
        [t, t, t, t, t, t, d, g, g, d, t, t, t, t, t, t],
        [t, t, t, t, t, t, d, g, g, d, t, t, t, t, t, t],
        [t, t, t, t, t, t, d, g, g, d, t, t, t, t, t, t],
        [t, t, t, t, t, d, g, g, g, g, d, t, t, t, t, t],
        [t, t, t, t, d, g, g, g, g, g, g, d, t, t, t, t],
        [t, t, t, d, g, g, t, t, t, t, g, g, d, t, t, t],
        [t, t, t, g, g, t, t, t, t, t, t, g, g, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn clippy_sprite(state: AgentState, _direction: Direction, frame: usize) -> &'static PixelSprite {
    match state {
        AgentState::Idle => {
            if frame % 4 == 3 {
                &CLIPPY_IDLE_2
            } else {
                &CLIPPY_IDLE_1
            }
        }
        _ => &CLIPPY_IDLE_1,
    }
}

// =============================================================================
// DEFAULT SPRITE (16x16)
// =============================================================================

const DEFAULT_SPRITE: PixelSprite = PixelSprite::new(make_default_sprite());

const fn make_default_sprite() -> [[Pixel; 16]; 16] {
    let t = TRANSPARENT;
    let g = DEFAULT_GRAY;
    let d = DEFAULT_DARK;
    let e = BLACK;
    let w = WHITE;

    [
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
        [t, t, t, t, t, g, g, g, g, g, g, t, t, t, t, t],
        [t, t, t, t, g, g, g, g, g, g, g, g, t, t, t, t],
        [t, t, t, g, g, g, g, g, g, g, g, g, g, t, t, t],
        [t, t, t, g, g, e, g, g, g, g, e, g, g, t, t, t],
        [t, t, t, g, g, w, g, g, g, g, w, g, g, t, t, t],
        [t, t, t, g, g, g, g, g, g, g, g, g, g, t, t, t],
        [t, t, t, g, g, g, g, g, g, g, g, g, g, t, t, t],
        [t, t, t, t, g, g, g, g, g, g, g, g, t, t, t, t],
        [t, t, t, t, d, d, d, d, d, d, d, d, t, t, t, t],
        [t, t, t, t, d, d, d, d, d, d, d, d, t, t, t, t],
        [t, t, t, t, d, d, d, d, d, d, d, d, t, t, t, t],
        [t, t, t, t, d, d, d, d, d, d, d, d, t, t, t, t],
        [t, t, t, t, t, d, d, t, t, d, d, t, t, t, t, t],
        [t, t, t, t, t, d, d, t, t, d, d, t, t, t, t, t],
        [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t],
    ]
}

fn default_sprite(_state: AgentState, _direction: Direction, _frame: usize) -> &'static PixelSprite {
    &DEFAULT_SPRITE
}
