//! Main terrarium widget - renders the simulation world

use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Widget};

use terrarium_sim::{Agent, AgentState, Ball, WorldState};

use crate::animation::AnimationState;
use crate::render::unicode;
use crate::sprites;

/// Widget for rendering the terrarium world
pub struct TerrariumWidget<'a> {
    state: &'a WorldState,
    animation: &'a AnimationState,
    selected_agent: Option<usize>,
}

impl<'a> TerrariumWidget<'a> {
    pub fn new(state: &'a WorldState, animation: &'a AnimationState, selected_agent: Option<usize>) -> Self {
        Self {
            state,
            animation,
            selected_agent,
        }
    }

    /// Convert simulation coordinates to terminal coordinates
    fn to_terminal_coords(&self, x: f64, y: f64, area: Rect) -> (u16, u16) {
        // Simulation bounds to terminal area mapping
        let term_x = ((x / self.state.bounds.x) * (area.width as f64 - 2.0)) as u16;
        let term_y = ((y / self.state.bounds.y) * (area.height as f64 - 2.0)) as u16;
        (term_x.min(area.width.saturating_sub(2)), term_y.min(area.height.saturating_sub(2)))
    }

    /// Render the ground plane
    fn render_ground(&self, buf: &mut Buffer, area: Rect) {
        let ground_start = (area.height as f64 * self.state.ground_y_ratio) as u16;

        // Draw horizon line
        if ground_start > 0 && ground_start < area.height {
            let y = area.y + ground_start;
            for x in area.x..area.x + area.width {
                if let Some(cell) = buf.cell_mut((x, y)) {
                    cell.set_char('─');
                    cell.set_fg(Color::DarkGray);
                }
            }
        }

        // Fill ground with gradient
        for dy in ground_start..area.height {
            let y = area.y + dy;
            let depth = (dy - ground_start) as f64 / (area.height - ground_start) as f64;
            let shade = if depth < 0.3 {
                '░'
            } else if depth < 0.6 {
                '▒'
            } else {
                '▓'
            };

            for x in area.x..area.x + area.width {
                if let Some(cell) = buf.cell_mut((x, y)) {
                    cell.set_char(shade);
                    cell.set_fg(Color::Rgb(60, 120, 60));  // Green grass
                    cell.set_bg(Color::Rgb(40, 80, 40));
                }
            }
        }
    }

    /// Render an agent at its position
    fn render_agent(&self, agent: &Agent, agent_idx: usize, buf: &mut Buffer, area: Rect) {
        let (term_x, term_y) = self.to_terminal_coords(agent.position.x, agent.position.y, area);

        // Get animation frame
        let frame = self.animation.frame_for_state(agent.state, agent_idx);

        // Get sprite for this agent
        let sprite = sprites::get_sprite(&agent.avatar, agent.state, agent.direction, frame);

        // Calculate sprite position (center on agent position)
        let sprite_x = term_x.saturating_sub(sprite.width / 2);
        let sprite_y = term_y.saturating_sub(sprite.lines.len() as u16);

        // Get colors
        let main_color = unicode::avatar_color(&agent.avatar);
        let accent_color = unicode::avatar_accent_color(&agent.avatar);
        let is_selected = self.selected_agent == Some(agent_idx);

        // Draw sprite
        for (line_idx, line) in sprite.lines.iter().enumerate() {
            let y = area.y + sprite_y + line_idx as u16;
            if y >= area.y + area.height {
                continue;
            }

            for (char_idx, ch) in line.chars().enumerate() {
                let x = area.x + sprite_x + char_idx as u16;
                if x >= area.x + area.width || ch == ' ' {
                    continue;
                }

                if let Some(cell) = buf.cell_mut((x, y)) {
                    cell.set_char(ch);
                    // Use accent color for eyes and special chars
                    let color = if ch == 'o' || ch == 'O' || ch == '○' || ch == '◉' || ch == '•' {
                        accent_color
                    } else {
                        main_color
                    };
                    cell.set_fg(color);

                    // Highlight selected agent
                    if is_selected {
                        cell.set_bg(Color::Rgb(60, 60, 80));
                    }
                }
            }
        }

        // Draw name below sprite
        let name_x = sprite_x;
        let name_y = area.y + sprite_y + sprite.lines.len() as u16;
        if name_y < area.y + area.height {
            for (i, ch) in agent.name.chars().take(10).enumerate() {
                let x = area.x + name_x + i as u16;
                if x < area.x + area.width {
                    if let Some(cell) = buf.cell_mut((x, name_y)) {
                        cell.set_char(ch);
                        cell.set_fg(if is_selected { Color::Yellow } else { Color::White });
                    }
                }
            }
        }

        // Draw state indicator for special states
        if agent.state == AgentState::NeedsAttention {
            // Draw "!" above head
            let indicator_y = area.y + sprite_y.saturating_sub(1);
            let indicator_x = area.x + term_x;
            if indicator_y >= area.y && indicator_x < area.x + area.width {
                if let Some(cell) = buf.cell_mut((indicator_x, indicator_y)) {
                    cell.set_char('❗');
                    cell.set_fg(Color::Red);
                }
            }
        }
    }

    /// Render the ball
    fn render_ball(&self, ball: &Ball, buf: &mut Buffer, area: Rect) {
        if !ball.active {
            return;
        }

        let (term_x, term_y) = self.to_terminal_coords(ball.position.x, ball.position.y, area);

        // Adjust for height (ball bouncing)
        let height_offset = (ball.height / 10.0) as u16;
        let ball_y = term_y.saturating_sub(height_offset);

        if ball_y >= area.y && ball_y < area.y + area.height {
            let x = area.x + term_x;
            if x < area.x + area.width {
                if let Some(cell) = buf.cell_mut((x, ball_y)) {
                    cell.set_char(unicode::chars::BALL);
                    cell.set_fg(Color::White);
                }

                // Draw shadow on ground
                let shadow_y = area.y + term_y;
                if shadow_y < area.y + area.height && height_offset > 0 {
                    if let Some(cell) = buf.cell_mut((x, shadow_y)) {
                        cell.set_char('·');
                        cell.set_fg(Color::DarkGray);
                    }
                }
            }
        }
    }

    /// Render chat bubbles
    fn render_bubbles(&self, buf: &mut Buffer, area: Rect) {
        for bubble in &self.state.bubbles {
            // Find the agent this bubble belongs to
            if let Some(agent) = self.state.agents.iter().find(|a| a.id == bubble.agent_id) {
                let (term_x, term_y) = self.to_terminal_coords(agent.position.x, agent.position.y, area);

                // Position bubble above agent
                let bubble_y = area.y + term_y.saturating_sub(5);
                let bubble_x = area.x + term_x.saturating_sub(bubble.content.chars().count() as u16 / 2);

                if bubble_y >= area.y {
                    // Draw bubble content
                    for (i, ch) in bubble.content.chars().enumerate() {
                        let x = bubble_x + i as u16;
                        if x < area.x + area.width {
                            if let Some(cell) = buf.cell_mut((x, bubble_y)) {
                                cell.set_char(ch);
                                cell.set_fg(if bubble.is_emoji { Color::Yellow } else { Color::Cyan });
                            }
                        }
                    }
                }
            }
        }
    }
}

impl<'a> Widget for TerrariumWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        // Draw border
        let block = Block::default()
            .borders(Borders::ALL)
            .title(" Agent Terrarium ")
            .title_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
            .border_style(Style::default().fg(Color::DarkGray));

        let inner = block.inner(area);
        block.render(area, buf);

        // Render ground
        self.render_ground(buf, inner);

        // Render ball
        if let Some(ref ball) = self.state.ball {
            self.render_ball(ball, buf, inner);
        }

        // Render agents (sorted by Y position for depth ordering)
        let mut agents_with_idx: Vec<_> = self.state.agents.iter().enumerate().collect();
        agents_with_idx.sort_by(|a, b| a.1.position.y.partial_cmp(&b.1.position.y).unwrap());

        for (idx, agent) in agents_with_idx {
            self.render_agent(agent, idx, buf, inner);
        }

        // Render bubbles on top
        self.render_bubbles(buf, inner);
    }
}
