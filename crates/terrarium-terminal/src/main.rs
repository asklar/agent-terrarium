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
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
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

async fn run_app<B: Backend>(terminal: &mut Terminal<B>, app: &mut App) -> io::Result<()> {
    let mut tick_interval = interval(Duration::from_millis(TICK_RATE_MS));

    loop {
        // Draw the UI and collect Sixel sprites
        let mut sixel_sprites = Vec::new();
        terminal.draw(|frame| {
            sixel_sprites = app.render(frame);
        })?;

        // Flush Sixel sprites to stdout after ratatui render
        if !sixel_sprites.is_empty() {
            let mut stdout = io::stdout();
            for sprite in &sixel_sprites {
                // Move cursor to sprite position and write Sixel data
                execute!(stdout, cursor::MoveTo(sprite.x, sprite.y))?;
                stdout.write_all(sprite.data.as_bytes())?;
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
