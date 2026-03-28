//! Application state management

use terrarium_sim::{AgentState, Vec2, World, WorldState};

use crate::animation::AnimationState;
use crate::render::RenderMode;
use crate::render::sixel::SixelRenderer;
use crate::widgets::terrarium::{TerrariumWidget, SixelSprite};
use crate::widgets::status_bar::StatusBarWidget;

use ratatui::prelude::*;

/// Available agent avatars for spawning
const AVATARS: &[&str] = &["cat", "copilot", "squirrel", "penguin", "ghost", "clippy"];

/// Names to use for spawned agents
const NAMES: &[&str] = &[
    "Whiskers", "Nova", "Nutkin", "Tux", "Boo", "Clippy",
    "Shadow", "Pixel", "Byte", "Widget", "Spark", "Glitch",
];

/// AI workflow overlay state (shown above agent sprite)
/// Used to indicate extended coding agent states beyond the base AgentState.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum AgentOverlay {
    /// No overlay
    None,
    /// Agent is looping/stuck (dizzy animation)
    Looping,
    /// Agent encountered an error (rain cloud)
    Errored,
    /// Agent is making progress (0-100%)
    Progress(u8),
}

pub struct App {
    /// The simulation world
    world: World,
    /// Current world state snapshot
    state: WorldState,
    /// Animation timing state
    animation: AnimationState,
    /// Selected render mode
    render_mode: RenderMode,
    /// Sixel renderer (if in Sixel mode)
    sixel_renderer: Option<SixelRenderer>,
    /// Currently selected agent index (for keyboard navigation)
    selected_agent: Option<usize>,
    /// Counter for generating unique agent names
    agent_counter: usize,
    /// Terminal dimensions
    terminal_size: (u16, u16),
}

impl App {
    pub fn new() -> Self {
        // Default terminal size, will be updated on first render
        let bounds = Vec2::new(120.0, 40.0);
        let world = World::new(bounds);

        // Detect render mode
        let render_mode = RenderMode::detect();
        let sixel_renderer = match render_mode {
            RenderMode::Sixel => Some(SixelRenderer::new()),
            RenderMode::Unicode => None,
        };
        log::info!("Render mode: {:?}", render_mode);

        // Add some initial agents
        world.add_agent("cat", "Whiskers");
        world.add_agent("copilot", "Nova");
        world.add_agent("squirrel", "Nutkin");

        let state = world.get_state();

        Self {
            world,
            state,
            animation: AnimationState::new(),
            render_mode,
            sixel_renderer,
            selected_agent: None,
            agent_counter: 3,
            terminal_size: (120, 40),
        }
    }

    /// Run one tick of the simulation
    pub fn tick(&mut self) {
        self.world.tick();
        self.state = self.world.get_state();
        self.animation.tick();
    }

    /// Render the application. Returns any pending Sixel sprites to flush to stdout.
    pub fn render(&self, frame: &mut Frame) -> Vec<SixelSprite> {
        let area = frame.area();

        // Main layout: terrarium area + status bar
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(10),    // Terrarium
                Constraint::Length(3),  // Status bar
            ])
            .split(area);

        let sixel_sprites = std::cell::RefCell::new(Vec::new());

        // Render terrarium
        let mut terrarium = TerrariumWidget::new(&self.state, &self.animation, self.selected_agent);
        if let Some(ref renderer) = self.sixel_renderer {
            terrarium = terrarium.with_sixel(renderer, &sixel_sprites);
        }
        frame.render_widget(terrarium, chunks[0]);

        // Render status bar
        let status = StatusBarWidget::new(&self.state, &self.render_mode, self.selected_agent);
        frame.render_widget(status, chunks[1]);

        sixel_sprites.into_inner()
    }

    /// Handle terminal resize
    pub fn resize(&mut self, width: u16, height: u16) {
        self.terminal_size = (width, height);
        // Convert terminal chars to "pixels" (rough approximation)
        // Each char is roughly 2 "pixels" wide, 4 "pixels" tall for sprite scaling
        self.world.resize(width as f64 * 2.0, height as f64 * 4.0);
        log::debug!("Resized to {}x{}", width, height);
    }

    /// Add a random agent
    pub fn add_random_agent(&mut self) {
        let avatar = AVATARS[self.agent_counter % AVATARS.len()];
        let name = NAMES[self.agent_counter % NAMES.len()];
        let unique_name = if self.agent_counter >= NAMES.len() {
            format!("{} {}", name, self.agent_counter / NAMES.len() + 1)
        } else {
            name.to_string()
        };
        self.world.add_agent(avatar, &unique_name);
        self.agent_counter += 1;
        log::info!("Added agent: {} ({})", unique_name, avatar);
    }

    /// Remove the last agent (if any)
    pub fn remove_last_agent(&mut self) {
        let agents = self.world.list_agents();
        if let Some((id, name, _)) = agents.last() {
            self.world.remove_agent(id);
            log::info!("Removed agent: {}", name);
            // Adjust selection if needed
            if let Some(sel) = self.selected_agent {
                if sel >= agents.len() - 1 {
                    self.selected_agent = if agents.len() > 1 { Some(agents.len() - 2) } else { None };
                }
            }
        }
    }

    /// Throw a ball into the terrarium
    pub fn throw_ball(&mut self) {
        let state = self.world.get_state();
        // Throw from random position at top
        let x = state.bounds.x * 0.3 + (state.tick as f64 % 100.0) / 100.0 * state.bounds.x * 0.4;
        let y = state.bounds.y * 0.2;
        let vx = ((state.tick % 200) as f64 - 100.0) * 1.5;
        let vy = 100.0;
        self.world.throw_ball(x, y, vx, vy);
        log::info!("Ball thrown at ({:.0}, {:.0})", x, y);
    }

    /// Set the selected agent to a specific state (for demo/testing)
    pub fn set_agent_state_demo(&mut self, new_state: AgentState) {
        if let Some(idx) = self.selected_agent {
            let mut state = self.world.state.lock().unwrap();
            if let Some(agent) = state.agents.get_mut(idx) {
                agent.state = new_state;
                log::info!("Set {} to {:?}", agent.name, new_state);
            }
        }
    }

    /// Select the next agent
    pub fn select_next_agent(&mut self) {
        let count = self.state.agents.len();
        if count == 0 {
            self.selected_agent = None;
            return;
        }
        self.selected_agent = Some(match self.selected_agent {
            Some(idx) => (idx + 1) % count,
            None => 0,
        });
    }

    /// Select the previous agent
    pub fn select_previous_agent(&mut self) {
        let count = self.state.agents.len();
        if count == 0 {
            self.selected_agent = None;
            return;
        }
        self.selected_agent = Some(match self.selected_agent {
            Some(idx) => if idx == 0 { count - 1 } else { idx - 1 },
            None => count - 1,
        });
    }
}
