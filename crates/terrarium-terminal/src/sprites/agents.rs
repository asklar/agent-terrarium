//! Agent sprite definitions
//!
//! Each agent has multiple animation frames for different states.
//! Sprites are defined as arrays of strings, where each string is one line.

use terrarium_sim::{AgentState, Direction};

/// A sprite frame with width and lines
pub struct SpriteFrame {
    pub lines: &'static [&'static str],
    pub width: u16,
}

impl SpriteFrame {
    pub const fn new(lines: &'static [&'static str], width: u16) -> Self {
        Self { lines, width }
    }
}

/// Get sprite for an agent based on avatar, state, direction, and animation frame
pub fn get_sprite(avatar: &str, state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
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
// CAT SPRITES
// =============================================================================

fn cat_sprite(state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => cat_idle(direction, frame),
        AgentState::Walking => cat_walk(direction, frame),
        AgentState::Running => cat_run(direction, frame),
        AgentState::NeedsAttention => cat_attention(frame),
        AgentState::Chatting => cat_chat(frame),
        _ => cat_idle(direction, 0),
    }
}

fn cat_idle(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &[" /\\_/\\ ", "( o.o )", " > ^ < "],
            &[" /\\_/\\ ", "( o.o )", " >·^ < "],
            &[" /\\_/\\ ", "( o.o )", " > ^·< "],
            &[" /\\_/\\ ", "( -.- )", " > ^ < "],  // Blink
        ],
        Direction::Left => &[
            &[" /\\_/\\ ", "( o.o )", " > ^ < "],
            &[" /\\_/\\ ", "( o.o )", " >·^ < "],
            &[" /\\_/\\ ", "( o.o )", " > ^·< "],
            &[" /\\_/\\ ", "( -.- )", " > ^ < "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn cat_walk(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &[" /\\_/\\  ", "( o.o ) ", " />^<\\  "],
            &[" /\\_/\\  ", "( o.o )>", "  >^<   "],
            &[" /\\_/\\  ", "( o.o ) ", "  />^<\\ "],
            &[" /\\_/\\  ", "( o.o )>", "   >^<  "],
        ],
        Direction::Left => &[
            &["  /\\_/\\ ", " ( o.o )", "  />^<\\ "],
            &["<( o.o )", " /\\_/\\  ", "   >^<  "],
            &[" /\\_/\\  ", " ( o.o )", " />^<\\  "],
            &["<( o.o )", " /\\_/\\  ", "  >^<   "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

fn cat_run(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["  /\\_/\\»", " ( o.o )»", "  />^<\\"],
            &[" /\\_/\\ »", "( o.o )»»", " />^<\\  "],
        ],
        Direction::Left => &[
            &["«/\\_/\\  ", "«( o.o ) ", " />^<\\  "],
            &["« /\\_/\\ ", "««( o.o )", "  />^<\\ "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 9)
}

fn cat_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  \\o/   ", " /\\_/\\ ", "( ^o^ )", " > ^ < "],
        &["  \\o\\   ", " /\\_/\\ ", "( ^o^ )", " > ^ < "],
        &["  /o/   ", " /\\_/\\ ", "( ^o^ )", " > ^ < "],
        &["  /o\\   ", " /\\_/\\ ", "( ^o^ )", " > ^ < "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

fn cat_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["   💬  ", " /\\_/\\ ", "( o.o )", " > ^ < "],
        &["   💭  ", " /\\_/\\ ", "( o.o )", " > ^ < "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

// =============================================================================
// COPILOT SPRITES
// =============================================================================

fn copilot_sprite(state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => copilot_idle(frame),
        AgentState::Walking => copilot_walk(direction, frame),
        AgentState::Running => copilot_run(direction, frame),
        AgentState::NeedsAttention => copilot_attention(frame),
        AgentState::Chatting => copilot_chat(frame),
        _ => copilot_idle(0),
    }
}

fn copilot_idle(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  ◠‿◠  ", " [===] ", " /|  |\\ "],
        &["  ◠‿◠  ", " [===] ", " /|  |\\ "],
        &["  ◠‿◠  ", " [===] ", "/|    |\\"],
        &["  ◠-◠  ", " [===] ", " /|  |\\ "],  // Blink
    ];
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

fn copilot_walk(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["  ◠‿◠ >", " [===]  ", " /|  |  "],
            &["  ◠‿◠ >", " [===]  ", "  |  |\\ "],
        ],
        Direction::Left => &[
            &["< ◠‿◠  ", "  [===] ", "  |  |\\ "],
            &["< ◠‿◠  ", "  [===] ", " /|  |  "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

fn copilot_run(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["  ◠‿◠ »»", " [===]  ", " /|  |  "],
            &["  ◠‿◠ »»", " [===]  ", "  |  |\\ "],
        ],
        Direction::Left => &[
            &["«« ◠‿◠  ", "  [===] ", "  |  |\\ "],
            &["«« ◠‿◠  ", "  [===] ", " /|  |  "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 9)
}

fn copilot_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &[" \\o/  ", " ◠o◠  ", "[===] ", "/|  |\\"],
        &[" \\o\\  ", " ◠o◠  ", "[===] ", "/|  |\\"],
        &[" /o/  ", " ◠o◠  ", "[===] ", "/|  |\\"],
        &[" /o\\  ", " ◠o◠  ", "[===] ", "/|  |\\"],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 6)
}

fn copilot_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["   💬  ", "  ◠‿◠  ", " [===] ", " /|  |\\ "],
        &["   💭  ", "  ◠‿◠  ", " [===] ", " /|  |\\ "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

// =============================================================================
// SQUIRREL SPRITES
// =============================================================================

fn squirrel_sprite(state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => squirrel_idle(direction, frame),
        AgentState::Walking | AgentState::Running => squirrel_run(direction, frame),
        AgentState::NeedsAttention => squirrel_attention(frame),
        AgentState::Chatting => squirrel_chat(frame),
        _ => squirrel_idle(direction, 0),
    }
}

fn squirrel_idle(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["   /\\  ", " (•ω•) ", "c(\")(\")", "   §   "],
            &["   /\\  ", " (•ω•) ", "c(\")(\")", "  §    "],
            &["   /\\  ", " (•-•) ", "c(\")(\")", "   §   "],  // Blink
        ],
        Direction::Left => &[
            &["  /\\   ", " (•ω•) ", "(\")(\")", "   §   "],
            &["  /\\   ", " (•ω•) ", "(\")(\")", "    §  "],
            &["  /\\   ", " (•-•) ", "(\")(\")", "   §   "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn squirrel_run(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["   /\\ »", " (•ω•) ", "((\")(\")", " ~§~   "],
            &["  ~/\\» ", " (•ω•)~", " (\")(\")", "  ~§   "],
        ],
        Direction::Left => &[
            &["« /\\   ", " (•ω•) ", "((\")(\")", "   ~§~ "],
            &[" «/\\~  ", "~(•ω•) ", " (\")(\")", "   §~  "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 8)
}

fn squirrel_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &[" \\o/  ", "  /\\  ", "(•o•) ", "(\")(\")", "  §   "],
        &[" \\o\\  ", "  /\\  ", "(•o•) ", "(\")(\")", "  §   "],
        &[" /o/  ", "  /\\  ", "(•o•) ", "(\")(\")", "  §   "],
        &[" /o\\  ", "  /\\  ", "(•o•) ", "(\")(\")", "  §   "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 6)
}

fn squirrel_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  💬  ", "  /\\  ", "(•ω•) ", "(\")(\")", "  §   "],
        &["  💭  ", "  /\\  ", "(•ω•) ", "(\")(\")", "  §   "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 6)
}

// =============================================================================
// PENGUIN SPRITES
// =============================================================================

fn penguin_sprite(state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => penguin_idle(direction, frame),
        AgentState::Walking => penguin_walk(direction, frame),
        AgentState::Running => penguin_walk(direction, frame), // Penguins waddle fast
        AgentState::NeedsAttention => penguin_attention(frame),
        AgentState::Chatting => penguin_chat(frame),
        _ => penguin_idle(direction, 0),
    }
}

fn penguin_idle(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &[" (°v°) ", " /||\\\\", "  |\\   "],
            &[" (°v°) ", " /||\\\\", "   |\\  "],
            &[" (°-°) ", " /||\\\\", "  |\\   "],  // Blink
        ],
        Direction::Left => &[
            &[" (°v°) ", "//||\\ ", "   /|  "],
            &[" (°v°) ", "//||\\ ", "  /|   "],
            &[" (°-°) ", "//||\\ ", "   /|  "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn penguin_walk(direction: Direction, frame: usize) -> SpriteFrame {
    // Waddle animation
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &[" (°v°)>", "  /||\\ ", "   |\\  "],
            &[">(°v°) ", " /||\\\\ ", "  |\\   "],
        ],
        Direction::Left => &[
            &["<(°v°) ", " /||\\\\ ", "  /|   "],
            &[" (°v°)<", "//||\\ ", "   /|  "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn penguin_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &[" \\o/  ", "(°o°) ", " /||\\ ", "  ||  "],
        &[" \\o\\  ", "(°o°) ", " /||\\ ", "  ||  "],
        &[" /o/  ", "(°o°) ", " /||\\ ", "  ||  "],
        &[" /o\\  ", "(°o°) ", " /||\\ ", "  ||  "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 6)
}

fn penguin_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  💬  ", "(°v°) ", " /||\\ ", "  ||  "],
        &["  💭  ", "(°v°) ", " /||\\ ", "  ||  "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 6)
}

// =============================================================================
// GHOST SPRITES
// =============================================================================

fn ghost_sprite(state: AgentState, _direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => ghost_idle(frame),
        AgentState::Walking | AgentState::Running => ghost_float(frame),
        AgentState::NeedsAttention => ghost_attention(frame),
        AgentState::Chatting => ghost_chat(frame),
        _ => ghost_idle(0),
    }
}

fn ghost_idle(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  ╭───╮ ", " ( o o )", " │     │", " ╰~╯~╯~╯"],
        &["  ╭───╮ ", " ( o o )", " │     │", " ╰╯~╯~╰╯"],
        &["  ╭───╮ ", " ( - - )", " │     │", " ╰~╯~╯~╯"],  // Blink
    ];
    SpriteFrame::new(frames[frame % frames.len()], 9)
}

fn ghost_float(frame: usize) -> SpriteFrame {
    // Floating bob animation
    let frames: &[&[&str]] = &[
        &["        ", "  ╭───╮ ", " ( o o )", " ╰~╯~╯~╯"],
        &["  ╭───╮ ", " ( o o )", " │     │", " ╰~╯~╯~╯"],
        &["        ", "  ╭───╮ ", " ( o o )", " ╰╯~╯~╰╯"],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 9)
}

fn ghost_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  \\o/  ", " ╭───╮ ", "( O O )", "╰~╯~╯~╯"],
        &["  \\o\\  ", " ╭───╮ ", "( O O )", "╰~╯~╯~╯"],
        &["  /o/  ", " ╭───╮ ", "( O O )", "╰~╯~╯~╯"],
        &["  /o\\  ", " ╭───╮ ", "( O O )", "╰~╯~╯~╯"],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn ghost_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["   💬   ", "  ╭───╮ ", " ( o o )", " ╰~╯~╯~╯"],
        &["   💭   ", "  ╭───╮ ", " ( o o )", " ╰~╯~╯~╯"],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 9)
}

// =============================================================================
// CLIPPY SPRITES
// =============================================================================

fn clippy_sprite(state: AgentState, direction: Direction, frame: usize) -> SpriteFrame {
    match state {
        AgentState::Idle => clippy_idle(frame),
        AgentState::Walking | AgentState::Running => clippy_walk(direction, frame),
        AgentState::NeedsAttention => clippy_attention(frame),
        AgentState::Chatting => clippy_chat(frame),
        _ => clippy_idle(0),
    }
}

fn clippy_idle(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  ╭─╮  ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰───╯ "],
        &["  ╭─╮  ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰───╯ "],
        &["  ╭─╮  ", " ╭╯-╰╮ ", " │ ╱ │ ", " ╰───╯ "],  // Blink
    ];
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn clippy_walk(direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = match direction {
        Direction::Right => &[
            &["  ╭─╮> ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰─╯╰╯ "],
            &[" >╭─╮  ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰╯─╰╯ "],
        ],
        Direction::Left => &[
            &[" <╭─╮  ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰╯─╰╯ "],
            &["  ╭─╮< ", " ╭╯○╰╮ ", " │ ╱ │ ", " ╰─╯╰╯ "],
        ],
    };
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn clippy_attention(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["  \\?/  ", "  ╭─╮  ", " ╭╯◉╰╮ ", " ╰───╯ "],
        &["  \\?\\  ", "  ╭─╮  ", " ╭╯◉╰╮ ", " ╰───╯ "],
        &["  /?/  ", "  ╭─╮  ", " ╭╯◉╰╮ ", " ╰───╯ "],
        &["  /?\\  ", "  ╭─╮  ", " ╭╯◉╰╮ ", " ╰───╯ "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

fn clippy_chat(frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &["   💬  ", "  ╭─╮  ", " ╭╯○╰╮ ", " ╰───╯ "],
        &["   💭  ", "  ╭─╮  ", " ╭╯○╰╮ ", " ╰───╯ "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 7)
}

// =============================================================================
// DEFAULT SPRITE (fallback)
// =============================================================================

fn default_sprite(_state: AgentState, _direction: Direction, frame: usize) -> SpriteFrame {
    let frames: &[&[&str]] = &[
        &[" ┌─┐ ", " │○│ ", " └─┘ "],
        &[" ┌─┐ ", " │-│ ", " └─┘ "],
    ];
    SpriteFrame::new(frames[frame % frames.len()], 5)
}
