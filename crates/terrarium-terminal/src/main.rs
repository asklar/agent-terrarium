//! Terminal-based renderer for Agent Terrarium
//!
//! A ratatui+crossterm TUI that displays the terrarium simulation
//! with Unicode sprites and optional Sixel graphics support.

mod app;
mod animation;
mod render;
mod sprites;
mod widgets;

use std::io;
use std::io::Write;
use std::time::Duration;

use crossterm::{
    cursor,
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::prelude::*;
use tokio::time::interval;

use app::App;

const TICK_RATE_MS: u64 = 50; // 20 Hz simulation tick

#[tokio::main]
async fn main() -> io::Result<()> {
    // Initialize logging to file (avoid polluting TUI display)
    let log_file = std::fs::File::create("terrarium-tui.log").unwrap_or_else(|_| {
        std::fs::File::create("/dev/null").expect("Failed to open /dev/null")
    });
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .target(env_logger::Target::Pipe(Box::new(log_file)))
        .init();

    log::info!("Starting Agent Terrarium TUI");

    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app
    let mut app = App::new();

    // Run the app
    let result = run_app(&mut terminal, &mut app).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(e) = result {
        log::error!("Application error: {}", e);
        return Err(e);
    }

    log::info!("Agent Terrarium TUI exited cleanly");
    Ok(())
}

/// Create a solid background-colored Sixel block to erase old sprite positions
/// Uses the terminal background color (black) to overwrite previous Sixel graphics
fn make_bg_sixel(width: u16, height: u16) -> String {
    // Use ground color (40, 80, 40) as most sprites are on the ground
    let r_pct = (40u32 * 100) / 255;
    let g_pct = (80u32 * 100) / 255;
    let b_pct = (40u32 * 100) / 255;
    let mut output = String::new();
    output.push_str("\x1bP0;1;q");
    // Define color 0 as ground color
    output.push_str(&format!("#0;2;{};{};{}", r_pct, g_pct, b_pct));
    output.push_str("#0");

    let sixel_rows = (height + 5) / 6;
    for row in 0..sixel_rows {
        let remaining = height.saturating_sub(row * 6);
        let bits = if remaining >= 6 { 0x3F } else { (1u8 << remaining) - 1 };
        let ch = (0x3F + bits) as char;
        for _ in 0..width {
            output.push(ch);
        }
        if row < sixel_rows - 1 {
            output.push('-');
        }
    }
    output.push_str("\x1b\\");
    output
}

async fn run_app<B: Backend>(terminal: &mut Terminal<B>, app: &mut App) -> io::Result<()> {
    let mut tick_interval = interval(Duration::from_millis(TICK_RATE_MS));
    let mut prev_sprite_positions: Vec<(u16, u16)> = Vec::new();
    // Background-colored Sixel block to overwrite old sprite positions
    let bg_sixel = make_bg_sixel(16, 16);

    loop {
        // Draw the UI and collect Sixel sprites
        let mut sixel_sprites = Vec::new();
        terminal.draw(|frame| {
            sixel_sprites = app.render(frame);
        })?;

        // Erase old Sixel sprites by overwriting with background-colored block
        {
            let mut stdout = io::stdout();
            for (px, py) in &prev_sprite_positions {
                execute!(stdout, cursor::MoveTo(*px, *py))?;
                stdout.write_all(bg_sixel.as_bytes())?;
            }

            // Draw new sprites
            prev_sprite_positions.clear();
            for sprite in &sixel_sprites {
                execute!(stdout, cursor::MoveTo(sprite.x, sprite.y))?;
                stdout.write_all(sprite.data.as_bytes())?;
                prev_sprite_positions.push((sprite.x, sprite.y));
            }
            stdout.flush()?;
        }

        // Handle events with timeout
        tokio::select! {
            _ = tick_interval.tick() => {
                app.tick();
            }
            result = tokio::task::spawn_blocking(|| {
                if event::poll(Duration::from_millis(10)).unwrap_or(false) {
                    event::read().ok()
                } else {
                    None
                }
            }) => {
                if let Ok(Some(event)) = result {
                    match event {
                        Event::Key(key) if key.kind == KeyEventKind::Press => {
                            match key.code {
                                KeyCode::Char('q') | KeyCode::Esc => {
                                    return Ok(());
                                }
                                KeyCode::Char('a') => {
                                    app.add_random_agent();
                                }
                                KeyCode::Char('r') => {
                                    app.remove_last_agent();
                                }
                                KeyCode::Char('b') => {
                                    app.throw_ball();
                                }
                                KeyCode::Char('1') => {
                                    app.set_agent_state_demo(terrarium_sim::AgentState::Idle);
                                }
                                KeyCode::Char('2') => {
                                    app.set_agent_state_demo(terrarium_sim::AgentState::Walking);
                                }
                                KeyCode::Char('3') => {
                                    app.set_agent_state_demo(terrarium_sim::AgentState::Running);
                                }
                                KeyCode::Char('4') => {
                                    app.set_agent_state_demo(terrarium_sim::AgentState::NeedsAttention);
                                }
                                KeyCode::Char('5') => {
                                    app.set_agent_state_demo(terrarium_sim::AgentState::Chatting);
                                }
                                KeyCode::Left => {
                                    app.select_previous_agent();
                                }
                                KeyCode::Right => {
                                    app.select_next_agent();
                                }
                                _ => {}
                            }
                        }
                        Event::Resize(width, height) => {
                            app.resize(width, height);
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}
