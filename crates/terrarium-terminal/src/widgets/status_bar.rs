//! Status bar widget

use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Paragraph, Widget};

use terrarium_sim::WorldState;

use crate::render::RenderMode;

/// Status bar showing simulation info and controls
pub struct StatusBarWidget<'a> {
    state: &'a WorldState,
    render_mode: &'a RenderMode,
    selected_agent: Option<usize>,
}

impl<'a> StatusBarWidget<'a> {
    pub fn new(state: &'a WorldState, render_mode: &'a RenderMode, selected_agent: Option<usize>) -> Self {
        Self {
            state,
            render_mode,
            selected_agent,
        }
    }
}

impl<'a> Widget for StatusBarWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray));

        let inner = block.inner(area);
        block.render(area, buf);

        // Build status text
        let agent_count = self.state.agents.len();
        let ball_status = if self.state.ball.as_ref().map(|b| b.active).unwrap_or(false) {
            "🎾"
        } else {
            "  "
        };

        let selected_info = if let Some(idx) = self.selected_agent {
            if let Some(agent) = self.state.agents.get(idx) {
                format!(" | Selected: {} ({:?})", agent.name, agent.state)
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let status = format!(
            " Tick: {} | Agents: {} {} | Mode: {}{}",
            self.state.tick,
            agent_count,
            ball_status,
            self.render_mode.display_name(),
            selected_info,
        );

        let controls = " [a]dd agent  [r]emove  [b]all  [←/→] select  [1-5] states  [q]uit ";

        // Layout: status on left, controls on right
        let layout = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Min(30),
                Constraint::Length(controls.len() as u16 + 2),
            ])
            .split(inner);

        // Status text
        let status_para = Paragraph::new(status)
            .style(Style::default().fg(Color::White));
        status_para.render(layout[0], buf);

        // Controls hint
        let controls_para = Paragraph::new(controls)
            .style(Style::default().fg(Color::DarkGray))
            .alignment(Alignment::Right);
        controls_para.render(layout[1], buf);
    }
}
