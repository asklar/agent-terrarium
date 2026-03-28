//! Sixel graphics rendering for capable terminals
//!
//! Sixel is a bitmap graphics format supported by terminals like xterm, mlterm,
//! WezTerm, foot, and mintty. This module provides detection and rendering.

/// Check if the current terminal supports Sixel graphics
pub fn detect_sixel_support() -> bool {
    // Check environment hints first
    if std::env::var("SIXEL_SUPPORT").map(|v| v == "1").unwrap_or(false) {
        return true;
    }

    if std::env::var("NO_SIXEL").map(|v| v == "1").unwrap_or(false) {
        return false;
    }

    let term = std::env::var("TERM").unwrap_or_default();
    let term_program = std::env::var("TERM_PROGRAM").unwrap_or_default().to_lowercase();

    // tmux doesn't support Sixel passthrough
    if term.contains("screen") || term.contains("tmux") {
        log::debug!("Sixel disabled: running in tmux/screen");
        return false;
    }

    // Known Sixel-capable terminals
    let known_sixel = ["mlterm", "wezterm", "foot", "mintty", "yaft", "contour"];
    if known_sixel.iter().any(|t| term_program.contains(t)) {
        log::debug!("Sixel enabled: known capable terminal {}", term_program);
        return true;
    }

    // xterm with Sixel support (xterm -ti vt340)
    if term.contains("xterm") {
        // Could query DA1 here, but for safety default to false
        // User can set SIXEL_SUPPORT=1 to enable
        log::debug!("Sixel uncertain: xterm detected, use SIXEL_SUPPORT=1 to enable");
        return false;
    }

    // Try DA1 query on Unix systems
    #[cfg(unix)]
    {
        if query_da1_sixel() {
            return true;
        }
    }

    false
}

/// Query terminal via DA1 (Primary Device Attributes) for Sixel support
///
/// Sends ESC [ c and looks for ";4;" in response (Sixel capability)
#[cfg(unix)]
fn query_da1_sixel() -> bool {
    // This is a simplified check - full implementation would need termios
    // to set raw mode and handle the async response properly.
    // For now, return false and let users use SIXEL_SUPPORT env var.
    false
}

/// Detect terminal cell size in pixels for proper Sixel scaling
#[allow(dead_code)]
pub fn detect_cell_size() -> (u16, u16) {
    // Try TIOCGWINSZ ioctl on Unix
    #[cfg(unix)]
    {
        if let Some((cw, ch)) = query_cell_size_ioctl() {
            return (cw, ch);
        }
    }

    // Fallback: assume common terminal cell size
    // Most terminals use 10x20 or 8x16 pixels per cell
    (10, 20)
}

#[cfg(unix)]
#[allow(dead_code)]
fn query_cell_size_ioctl() -> Option<(u16, u16)> {
    use std::os::unix::io::AsRawFd;

    #[repr(C)]
    struct Winsize {
        ws_row: libc::c_ushort,
        ws_col: libc::c_ushort,
        ws_xpixel: libc::c_ushort,
        ws_ypixel: libc::c_ushort,
    }

    let mut ws = Winsize {
        ws_row: 0,
        ws_col: 0,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };

    let fd = std::io::stdout().as_raw_fd();

    // TIOCGWINSZ = 0x5413 on Linux
    #[cfg(target_os = "linux")]
    const TIOCGWINSZ: libc::c_ulong = 0x5413;

    #[cfg(target_os = "macos")]
    const TIOCGWINSZ: libc::c_ulong = 0x40087468;

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    const TIOCGWINSZ: libc::c_ulong = 0x5413;

    let result = unsafe { libc::ioctl(fd, TIOCGWINSZ, &mut ws) };

    if result == 0 && ws.ws_xpixel > 0 && ws.ws_ypixel > 0 && ws.ws_col > 0 && ws.ws_row > 0 {
        let cell_width = ws.ws_xpixel / ws.ws_col;
        let cell_height = ws.ws_ypixel / ws.ws_row;
        if cell_width > 0 && cell_height > 0 {
            return Some((cell_width, cell_height));
        }
    }

    None
}

/// Sixel renderer for terminal graphics
///
/// This renderer is available for use when Sixel-capable terminals are detected.
/// Currently used for infrastructure - full sprite rendering is planned.
#[allow(dead_code)]
pub struct SixelRenderer {
    cell_width: u16,
    cell_height: u16,
}

#[allow(dead_code)]
impl SixelRenderer {
    /// Create a new Sixel renderer with detected cell size
    pub fn new() -> Self {
        let (cell_width, cell_height) = detect_cell_size();
        log::info!("Sixel renderer: cell size {}x{} pixels", cell_width, cell_height);
        Self {
            cell_width,
            cell_height,
        }
    }

    /// Get the number of terminal columns needed for a sprite of given pixel width
    pub fn cols_for_width(&self, pixel_width: u16) -> u16 {
        (pixel_width + self.cell_width - 1) / self.cell_width
    }

    /// Get the number of terminal rows needed for a sprite of given pixel height
    pub fn rows_for_height(&self, pixel_height: u16) -> u16 {
        (pixel_height + self.cell_height - 1) / self.cell_height
    }

    /// Render a simple colored rectangle as Sixel (for testing)
    pub fn render_rect(&self, width: u16, height: u16, r: u8, g: u8, b: u8) -> String {
        // Sixel format:
        // ESC P q          - Start sixel
        // # <n> ; 2 ; r ; g ; b  - Define color #n as RGB (percentages)
        // <data>           - Sixel data (6 rows per character)
        // ESC \            - End sixel

        let r_pct = (r as u32 * 100) / 255;
        let g_pct = (g as u32 * 100) / 255;
        let b_pct = (b as u32 * 100) / 255;

        let mut output = String::new();

        // Start Sixel sequence
        output.push_str("\x1bPq");

        // Define color 1
        output.push_str(&format!("#1;2;{};{};{}", r_pct, g_pct, b_pct));

        // Use color 1
        output.push_str("#1");

        // Sixel data: each char represents 6 vertical pixels
        // '?' (0x3F) is the base, add 1-63 for which of 6 pixels are on
        // '~' (0x7E) = all 6 pixels on (0x3F + 0x3F)
        let _full_row = '~'; // All 6 pixels on

        let sixel_rows = (height + 5) / 6;
        for row in 0..sixel_rows {
            // Determine which bits to set for this row
            let remaining = height.saturating_sub(row * 6);
            let bits = if remaining >= 6 {
                0x3F // All 6 bits
            } else {
                (1 << remaining) - 1 // Only `remaining` bits
            };
            let ch = (0x3F + bits) as u8 as char;

            // Repeat character for width
            for _ in 0..width {
                output.push(ch);
            }

            // Next row (Sixel newline)
            if row < sixel_rows - 1 {
                output.push('-');
            }
        }

        // End Sixel sequence
        output.push_str("\x1b\\");

        output
    }

    /// Render agent sprite as Sixel (placeholder - would need actual sprite data)
    pub fn render_sprite(
        &self,
        _avatar: &str,
        _state: terrarium_sim::AgentState,
        _direction: terrarium_sim::Direction,
        _frame: usize,
    ) -> Option<String> {
        // TODO: Load and render actual sprite PNG data
        // For now, return None to fall back to Unicode
        None
    }
}

impl Default for SixelRenderer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sixel_rect() {
        let renderer = SixelRenderer {
            cell_width: 10,
            cell_height: 20,
        };
        let sixel = renderer.render_rect(10, 12, 255, 128, 0);
        assert!(sixel.starts_with("\x1bPq"));
        assert!(sixel.ends_with("\x1b\\"));
        assert!(sixel.contains("#1;2;100;50;0")); // Orange color
    }
}
