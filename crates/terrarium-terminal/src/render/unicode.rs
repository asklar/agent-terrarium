//! Unicode block art rendering for agents

use ratatui::style::Color;

/// Unicode box drawing and block characters for rendering
#[allow(dead_code)]
pub mod chars {
    // Block elements
    pub const FULL_BLOCK: char = '█';
    pub const UPPER_HALF: char = '▀';
    pub const LOWER_HALF: char = '▄';
    pub const LEFT_HALF: char = '▌';
    pub const RIGHT_HALF: char = '▐';

    // Light/medium shading
    pub const LIGHT_SHADE: char = '░';
    pub const MEDIUM_SHADE: char = '▒';
    pub const DARK_SHADE: char = '▓';

    // Braille patterns (for fine detail)
    pub const BRAILLE_BLANK: char = '⠀';

    // Common symbols
    pub const BULLET: char = '•';
    pub const CIRCLE: char = '●';
    pub const DIAMOND: char = '◆';
    pub const STAR: char = '★';

    // Ball
    pub const BALL: char = '⚽';
    pub const BALL_ALT: char = '◯';

    // Weather
    pub const CLOUD: char = '☁';
    pub const RAIN: char = '🌧';
    pub const SUN: char = '☀';
}

/// Get color for an avatar type
pub fn avatar_color(avatar: &str) -> Color {
    match avatar {
        "cat" => Color::Rgb(255, 165, 0),      // Orange
        "copilot" => Color::Rgb(36, 41, 46),   // GitHub dark
        "squirrel" => Color::Rgb(139, 90, 43), // Brown
        "penguin" => Color::Rgb(30, 30, 30),   // Black
        "ghost" => Color::Rgb(200, 200, 255),  // Pale blue
        "clippy" => Color::Rgb(255, 215, 0),   // Gold
        _ => Color::Gray,
    }
}

/// Get accent color for an avatar type (for highlights, eyes, etc.)
pub fn avatar_accent_color(avatar: &str) -> Color {
    match avatar {
        "cat" => Color::Rgb(255, 255, 200),    // Cream
        "copilot" => Color::Rgb(0, 150, 255),  // Blue
        "squirrel" => Color::Rgb(50, 50, 50),  // Dark
        "penguin" => Color::White,
        "ghost" => Color::Rgb(100, 100, 150),  // Dark blue
        "clippy" => Color::Black,
        _ => Color::White,
    }
}

/// Get state indicator character
#[allow(dead_code)]
pub fn state_indicator(state: terrarium_sim::AgentState, frame: usize) -> &'static str {
    match state {
        terrarium_sim::AgentState::Idle => {
            // Foot tap animation
            match frame % 4 {
                0 => ".",
                1 => "·",
                2 => "..",
                _ => "··",
            }
        }
        terrarium_sim::AgentState::Walking => {
            match frame % 4 {
                0 => "→",
                1 => "↗",
                2 => "→",
                _ => "↘",
            }
        }
        terrarium_sim::AgentState::Running => {
            match frame % 4 {
                0 => "»",
                1 => "→»",
                2 => "»→",
                _ => "»»",
            }
        }
        terrarium_sim::AgentState::NeedsAttention => {
            // Waving animation
            match frame % 4 {
                0 => "\\o/",
                1 => "\\o\\",
                2 => "/o/",
                _ => "/o\\",
            }
        }
        terrarium_sim::AgentState::Chatting => {
            match frame % 2 {
                0 => "💬",
                _ => "💭",
            }
        }
        terrarium_sim::AgentState::Interacting => "♥",
        _ => "",
    }
}

/// "Looping/dizzy" indicator (for stuck agents)
#[allow(dead_code)]
pub fn looping_indicator(frame: usize) -> &'static str {
    match frame % 3 {
        0 => "@_@",
        1 => "@o@",
        _ => "@-@",
    }
}

/// "Errored" indicator (rain cloud)
#[allow(dead_code)]
pub fn errored_indicator(frame: usize) -> &'static str {
    match frame % 2 {
        0 => "☁:(",
        _ => "🌧:(",
    }
}

/// "Progress" indicator (building)
#[allow(dead_code)]
pub fn progress_indicator(progress_frame: usize) -> &'static str {
    match progress_frame {
        0 => "[░░░]",
        1 => "[▓░░]",
        2 => "[▓▓░]",
        _ => "[▓▓▓]",
    }
}
