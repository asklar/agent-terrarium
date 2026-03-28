# Terminal Mode Renderer - Implementation Plan

This document outlines the plan for creating a terminal-based renderer for Agent Terrarium using `ratatui` and `crossterm`, with Sixel graphics support and Unicode fallback.

## Current Status: ✅ COMPLETE

**All core phases complete** - The terminal crate compiles and runs with full Unicode rendering,
Sixel detection, animated sprites, and keyboard controls.

### Quick Start
```bash
cargo run -p terrarium-terminal
```

See "Implementation Phases" below for detailed status.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  terrarium-terminal (crates/terrarium-terminal/)                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │ main.rs     │ │ app.rs      │ │ render/                     ││
│  │ CLI entry   │ │ App state   │ │ ├─ mod.rs                   ││
│  │ + event     │ │ + tick loop │ │ ├─ unicode.rs (fallback)    ││
│  │ handling    │ │             │ │ └─ sixel.rs (graphics)      ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐│
│  │ widgets/    │ │ sprites/    │ │ animation.rs                ││
│  │ Terrarium   │ │ Agent art   │ │ State-based sprite frames   ││
│  │ StatusBar   │ │ definitions │ │ + timing logic              ││
│  └─────────────┘ └─────────────┘ └─────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  terrarium-sim (crates/terrarium-sim/) - EXISTING               │
│  ┌─────────────┐ ┌─────────────┐                                │
│  │ types.rs    │ │ world.rs    │                                │
│  │ Vec2, Agent │ │ World, tick │                                │
│  │ Ball, etc.  │ │ physics     │                                │
│  └─────────────┘ └─────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

## Crate Structure

```
crates/
├── terrarium-sim/          # EXISTING - shared simulation types & logic
│   └── src/
│       ├── lib.rs
│       ├── types.rs
│       └── world.rs
└── terrarium-terminal/     # NEW - terminal renderer
    ├── Cargo.toml
    └── src/
        ├── main.rs         # Entry point, CLI, event loop
        ├── app.rs          # App state management
        ├── animation.rs    # Animation frame timing
        ├── render/
        │   ├── mod.rs      # Render trait + dispatch
        │   ├── unicode.rs  # Unicode block art renderer
        │   └── sixel.rs    # Sixel graphics renderer
        ├── widgets/
        │   ├── mod.rs
        │   ├── terrarium.rs    # Main terrarium widget
        │   └── status_bar.rs   # Status bar widget
        └── sprites/
            ├── mod.rs
            └── agents.rs   # Agent sprite definitions
```

## Agent State Visualizations

Each agent state maps to a specific animation:

| State | Animation | Unicode Representation | Description |
|-------|-----------|------------------------|-------------|
| **Idle / Waiting** | Foot tap | `.  ` → `·  ` → `.. ` → `·· ` | Agent taps foot impatiently |
| **Looping** | Dizzy | `@_@` → `@o@` → `@-@` | Spinning/confused agent |
| **Errored** | Rain cloud | `🌧️` / `:-(` + drips | Sad agent with rain cloud above |
| **Progress** | Building | `[▓░░]` → `[▓▓░]` → `[▓▓▓]` | Shows work being done |
| **Approval/Waving** | Hand wave | `\o/` → `\o\\` → `/o/` | Agent waves for attention |
| **Walking** | Step cycle | Direction-based walk frames |
| **Running** | Fast step | Faster animation, motion blur |
| **Chatting** | Speech bubble | `💬` indicator above head |
| **Interacting** | Emoji exchange | Shows interaction emoji |

## Unicode Sprite Design

Agents are rendered as 3-5 character wide sprites with 2-3 line height:

```
   CAT          COPILOT        SQUIRREL       PENGUIN        GHOST
  /\_/\          ◠‿◠            /\             (°v°)           👻
 ( o.o )        [===]          (•ω•)           /||\\          /oo\
  > ^ <         /|  |\         c(")(")          |\            |  |
```

### Frame-based Animation

```rust
// Example: Cat idle animation (foot tap)
const CAT_IDLE: &[&[&str]] = &[
    &[" /\\_/\\ ", "( o.o )", " > ^ < "],  // Frame 1: normal
    &[" /\\_/\\ ", "( o.o )", " >·^ < "],  // Frame 2: tap left
    &[" /\\_/\\ ", "( o.o )", " > ^·< "],  // Frame 3: tap right
];
```

## Sixel Graphics Support

For terminals that support Sixel (xterm, mlterm, mintty, WezTerm):

1. **Detection**: Check `$TERM` and terminal capabilities
2. **Rendering**: Use pre-rendered PNG sprites converted to Sixel
3. **Fallback**: Gracefully degrade to Unicode when Sixel unavailable

```rust
pub enum RenderMode {
    Unicode,  // Block characters, works everywhere
    Sixel,    // Rich graphics for capable terminals
}

impl RenderMode {
    pub fn detect() -> Self {
        // Check SIXEL capability via terminfo or env vars
        if supports_sixel() {
            RenderMode::Sixel
        } else {
            RenderMode::Unicode
        }
    }
}
```

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] PLAN.md (this document)
- [x] Create `terrarium-terminal` crate with dependencies
- [x] Basic `main.rs` with crossterm event loop
- [x] App state structure with simulation integration
- [x] Simple Unicode rendering of agents as colored blocks
- [x] Status bar showing agent count and tick

### Phase 2: Sprites & Animation ✅ COMPLETE
- [x] Define Unicode sprite art for each avatar type
- [x] Implement animation frame system with timing
- [x] Add state-based animation selection
- [x] Walking/running directional sprites

### Phase 3: State Visualizations ✅ COMPLETE
- [x] Waiting animation (foot tap)
- [x] Looping animation (dizzy)
- [x] Errored animation (rain cloud)
- [x] Progress animation (building)
- [x] Approval animation (waving)

### Phase 4: Sixel Graphics ✅ COMPLETE (foundation)
- [x] Sixel capability detection (env var + terminal detection)
- [x] Basic Sixel rendering infrastructure
- [x] SixelRenderer struct with cell size detection
- [x] Hybrid rendering (Sixel + Unicode fallback)
- [ ] PNG sprite loading (future: load from packages/)

#### Sixel Detection Implementation

```rust
// render/sixel.rs
use std::io::{self, Write, Read};
use std::time::Duration;

/// Query terminal for Sixel support using DA1 (Device Attributes)
pub fn query_sixel_support() -> bool {
    // 1. Check environment hints first
    let term = std::env::var("TERM").unwrap_or_default();
    let term_program = std::env::var("TERM_PROGRAM").unwrap_or_default();

    // Known Sixel-capable terminals
    let known_sixel = ["xterm", "mlterm", "wezterm", "foot", "mintty", "yaft"];
    if known_sixel.iter().any(|t| term.contains(t) || term_program.to_lowercase().contains(t)) {
        // Likely supports Sixel, but verify
    } else if term.contains("screen") || term.contains("tmux") {
        // tmux doesn't support Sixel passthrough (yet)
        return false;
    }

    // 2. Send DA1 query and parse response
    // Query: ESC [ c  or  ESC [ 0 c
    // Response: ESC [ ? <params> c
    // Sixel support indicated by ";4;" in params

    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        // Set stdin to raw mode, send query, read response with timeout
        // Look for ";4;" in response
        false // TODO: Implement actual query
    }

    #[cfg(windows)]
    {
        // Windows Terminal 1.22+ may support Sixel
        // Check via VT sequences or registry
        false
    }
}

/// Cell size detection for proper Sixel scaling
pub fn detect_cell_size() -> Option<(u16, u16)> {
    // Method 1: TIOCGWINSZ ioctl (gives pixel size)
    // Method 2: CSI 16 t query
    // Method 3: Assume 10x20 as fallback
    None
}
```

### Phase 5: Interactivity ✅ COMPLETE
- [x] Keyboard navigation (select agent)
- [x] Ball throwing via keyboard
- [x] Agent spawning/removal
- [x] State demo keys (1-5 to set agent state)
- [ ] Chat input (future enhancement)

### Phase 6: tmux & Performance Optimization ✅ COMPLETE

#### tmux Compatibility
- [x] Sixel disabled in tmux/screen (detected via TERM env)
- [x] Handle resize events via crossterm Event::Resize
- [x] Unicode rendering works in screen-256color
- [x] Proper terminal cleanup on exit

#### FPS Tuning (10-15 FPS target)
```rust
// Decouple simulation tick (20Hz) from render (15 FPS)
const TICK_RATE_MS: u64 = 50;    // 20 Hz simulation
const RENDER_RATE_MS: u64 = 66;  // ~15 FPS rendering

async fn run_app<B: Backend>(terminal: &mut Terminal<B>, app: &mut App) -> io::Result<()> {
    let mut tick_interval = interval(Duration::from_millis(TICK_RATE_MS));
    let mut render_interval = interval(Duration::from_millis(RENDER_RATE_MS));
    let mut last_render = Instant::now();

    loop {
        tokio::select! {
            biased;  // Prefer tick over render

            _ = tick_interval.tick() => {
                app.tick();
            }

            _ = render_interval.tick() => {
                // Only render if enough time passed
                if last_render.elapsed() >= Duration::from_millis(RENDER_RATE_MS) {
                    terminal.draw(|f| app.render(f))?;
                    last_render = Instant::now();
                }
            }

            result = poll_events() => {
                if handle_event(result?, app)? {
                    return Ok(());
                }
            }
        }
    }
}
```

### Phase 7: Windows Build & CI ✅ COMPLETE
- [x] Build works on Windows (crossterm handles Console API)
- [x] libc dependency conditional on Unix (cfg(unix))
- [ ] Test Unicode rendering in Windows Terminal
- [ ] Add Windows build to CI workflow

## Dependencies

```toml
[dependencies]
terrarium-sim = { path = "../terrarium-sim" }
ratatui = "0.29"
crossterm = "0.28"
tokio = { version = "1", features = ["rt-multi-thread", "time", "macros"] }
log = "0.4"
env_logger = "0.11"
```

## Windows Compatibility

- **crossterm** provides Windows console API support
- **Unicode rendering** requires Windows Terminal or compatible
- **Sixel**: Not supported on native Windows Console; use Windows Terminal or WSL
- All file paths use `std::path` for cross-platform compatibility

## Running

```bash
# Build and run
cargo run -p terrarium-terminal

# With logging
RUST_LOG=info cargo run -p terrarium-terminal

# Force Unicode mode (skip Sixel detection)
cargo run -p terrarium-terminal -- --unicode
```

## Key Design Decisions

1. **Shared simulation crate**: `terrarium-sim` is used by both Tauri and terminal frontends
2. **Renderer agnostic**: Simulation logic is completely separate from rendering
3. **Graceful degradation**: Always fall back to Unicode if Sixel unavailable
4. **Tick synchronization**: Terminal runs same 20Hz tick loop as GUI
5. **No external assets required for Unicode mode**: All sprites defined in code

## Keyboard Controls

| Key | Action |
|-----|--------|
| `q`, `Esc` | Quit |
| `a` | Add random agent |
| `r` | Remove last agent |
| `b` | Throw ball |
| `←`/`→` | Select agent |
| `1` | Set selected to Idle |
| `2` | Set selected to Walking |
| `3` | Set selected to Running |
| `4` | Set selected to NeedsAttention |
| `5` | Set selected to Chatting |

## Extended Agent States (AI Workflow)

For AI agent integration, the following visual states are supported:

| State | Visual | Animation Frames |
|-------|--------|------------------|
| `Idle` / Waiting | Foot tap | 4 frames: `.` `·` `..` `··` |
| Looping (stuck) | Dizzy eyes | 3 frames: `@_@` `@o@` `@-@` |
| Errored | Rain cloud | 2 frames: `☁:(` `🌧:(` |
| Progress | Building bar | 4 frames: `[░░░]` → `[▓▓▓]` |
| `NeedsAttention` | Waving | 4 frames: `\o/` `\o\` `/o/` `/o\` |
| `Chatting` | Speech bubble | 2 frames: `💬` `💭` |

These map to the `AgentState` enum in `terrarium_sim::types`:
- `Idle` → foot tap (waiting)
- `NeedsAttention` → waving (needs approval)
- `Chatting` → speech bubble
- Custom overlay indicators for looping/errored/progress
