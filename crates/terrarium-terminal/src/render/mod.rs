//! Rendering system with Unicode fallback and Sixel support

pub mod unicode;
pub mod sixel;

/// Render mode selection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    /// Unicode block characters - works on all terminals
    Unicode,
    /// Sixel graphics - for capable terminals (xterm, mlterm, WezTerm, etc.)
    Sixel,
}

impl RenderMode {
    /// Detect the best render mode for the current terminal
    pub fn detect() -> Self {
        if sixel::detect_sixel_support() {
            log::info!("Sixel support detected");
            RenderMode::Sixel
        } else {
            log::info!("Using Unicode fallback rendering");
            RenderMode::Unicode
        }
    }

    /// Check if this mode uses graphical rendering
    #[allow(dead_code)]
    pub fn is_graphical(&self) -> bool {
        matches!(self, RenderMode::Sixel)
    }

    /// Get display name for status bar
    pub fn display_name(&self) -> &'static str {
        match self {
            RenderMode::Unicode => "Unicode",
            RenderMode::Sixel => "Sixel",
        }
    }
}
