//! Animation timing and frame management

use terrarium_sim::AgentState;

/// Animation frame timing
const FRAME_DURATION_TICKS: u64 = 4; // ~200ms per frame at 20Hz

/// Animation state tracker
pub struct AnimationState {
    /// Global tick counter for animation timing
    tick: u64,
}

impl AnimationState {
    pub fn new() -> Self {
        Self { tick: 0 }
    }

    /// Advance animation by one tick
    pub fn tick(&mut self) {
        self.tick = self.tick.wrapping_add(1);
    }

    /// Get the current animation frame index for an agent state
    pub fn frame_for_state(&self, state: AgentState, agent_offset: usize) -> usize {
        // Offset each agent's animation slightly so they don't all animate in sync
        let offset_tick = self.tick.wrapping_add(agent_offset as u64 * 7);
        let frame_tick = offset_tick / FRAME_DURATION_TICKS;

        match state {
            AgentState::Idle => {
                // Foot tap: 4 frames
                (frame_tick % 4) as usize
            }
            AgentState::Walking => {
                // Walk cycle: 4 frames
                (frame_tick % 4) as usize
            }
            AgentState::Running => {
                // Run cycle: 4 frames, faster
                ((offset_tick / 2) % 4) as usize
            }
            AgentState::Sprinting => {
                // Sprint: 4 frames, very fast
                (offset_tick % 4) as usize
            }
            AgentState::Jumping => {
                // Jump arc: 4 frames
                (frame_tick % 4) as usize
            }
            AgentState::Crawling => {
                // Crawl: 2 frames
                (frame_tick % 2) as usize
            }
            AgentState::Interacting => {
                // Interaction: 3 frames
                (frame_tick % 3) as usize
            }
            AgentState::Chatting => {
                // Chatting: 2 frames (speech bubble blink)
                (frame_tick % 2) as usize
            }
            AgentState::NeedsAttention => {
                // Waving: 4 frames
                (frame_tick % 4) as usize
            }
        }
    }

    /// Get animation frame for "looping" (stuck/confused) state
    #[allow(dead_code)]
    pub fn looping_frame(&self) -> usize {
        ((self.tick / FRAME_DURATION_TICKS) % 3) as usize
    }

    /// Get animation frame for "errored" (sad) state
    #[allow(dead_code)]
    pub fn errored_frame(&self) -> usize {
        ((self.tick / (FRAME_DURATION_TICKS * 2)) % 2) as usize
    }

    /// Get animation frame for "progress" (building) state
    #[allow(dead_code)]
    pub fn progress_frame(&self, progress: f32) -> usize {
        // Map 0.0-1.0 progress to frame 0-3
        ((progress * 3.0).floor() as usize).min(3)
    }

    /// Check if we should show a "blink" effect (for eyes, cursors, etc.)
    #[allow(dead_code)]
    pub fn should_blink(&self) -> bool {
        (self.tick / 10) % 5 == 0
    }

    /// Get current tick for external use
    #[allow(dead_code)]
    pub fn current_tick(&self) -> u64 {
        self.tick
    }
}
