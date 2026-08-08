# Architecture

Agent Terrarium is a **Tauri v2** desktop app with a Rust backend and a React/Canvas 2D frontend. The key design principle: **the frontend is a pure view layer**. All simulation state, physics, and game logic live in Rust. The frontend polls state via IPC every animation frame and renders it to a canvas.

```
┌──────────────────────────────────────────────┐
│  React + Canvas 2D  (view layer)             │
│  ┌──────────────┐ ┌────────────────────────┐ │
│  │ Terrarium    │ │ AnimatedBackground     │ │
│  │ Canvas       │ │ (themes, decorators,   │ │
│  │ (agents,     │ │  dynamic sky, weather, │ │
│  │  ball, gear, │ │  particles, music)     │ │
│  │  bubbles)    │ │                        │ │
│  └──────────────┘ └────────────────────────┘ │
│  ┌──────────────┐ ┌────────────────────────┐ │
│  │ ChatOverlay  │ │ ContextMenu,           │ │
│  │ ChatWindow   │ │ AgentConfigDialog,     │ │
│  │ (pop-out)    │ │ DebugPanel, Weather    │ │
│  └──────────────┘ └────────────────────────┘ │
├──────────────────────────────────────────────┤
│  Tauri IPC  (JSON commands, snake↔camelCase) │
├──────────────────────────────────────────────┤
│  Rust Simulation Engine                      │
│  ┌──────────────┐ ┌────────────────────────┐ │
│  │ World        │ │ Agent Backends         │ │
│  │ (tick @ 20Hz,│ │ (Echo, Copilot, OpenAI)│ │
│  │  movement,   │ │                        │ │
│  │  interactions│ │ Awareness Dispatcher   │ │
│  │  ball physics│ │ (event bus, tool use)  │ │
│  │  events)     │ │                        │ │
│  └──────────────┘ └────────────────────────┘ │
│  ┌──────────────┐ ┌────────────────────────┐ │
│  │ TTS (SAPI)   │ │ Config & Credentials   │ │
│  └──────────────┘ └────────────────────────┘ │
└──────────────────────────────────────────────┘
```

This design is **renderer-agnostic** — the Rust simulation engine could be paired with a different frontend (e.g. WinUI3 + Win2D) without changing any backend code.

## Project Structure

```
src/                              # React frontend
  App.tsx                         # Root: splash, config, weather, attention, events
  components/
    TerrariumCanvas.tsx           # Canvas renderer — agents, ball, gear, bubbles
    AnimatedBackground.tsx        # Theme backgrounds, decorators, dynamic sky, particles
    ChatOverlay.tsx               # Inline chat bubble (Markdown, code highlighting)
    ChatWindow.tsx                # Pop-out chat in a separate Tauri webview
    ContextMenu.tsx               # Right-click menu with keyboard nav
    AgentConfigDialog.tsx         # Agent backend/model/prompt configuration
    ThemeMusic.tsx                # Procedural 8-bit lofi music via Web Audio API
    WeatherWidget.tsx             # Current weather display (temperature, icon, forecast)
    DebugPanel.tsx                # Dev tools: time/weather overrides, attention testing
    WindowFrame.tsx               # Drag region + 8-point resize handles
    AboutDialog.tsx               # App info
    CodeBlock.tsx                 # Syntax highlighting for chat code blocks
    AgentSprites.ts               # Agent color palettes (legacy fallback)
  hooks/
    useWorldState.ts              # Polls get_world_state via requestAnimationFrame
  themes/
    PackageTypes.ts               # All package type definitions
    registry.ts                   # PackageRegistry singleton (loads built-in + user packages)
    index.ts                      # Barrel export
  types/
    world.ts                      # TypeScript types mirroring Rust structs
public/
  packages/                       # Built-in package JSON (themes, agents, gear)
packages/                         # Extended packages (themes with SVG assets)
src-tauri/                        # Rust backend
  src/
    lib.rs                        # Tauri #[tauri::command] handlers (IPC surface)
    main.rs                       # Entry point, CLI flags
    tts.rs                        # Windows SAPI text-to-speech
    simulation/
      types.rs                    # Vec2, Agent, Ball, WorldState, Personality, etc.
      world.rs                    # Simulation engine: tick loop, movement, physics
    agents/
      mod.rs                      # Agent module
      backend.rs                  # AgentBackend trait definition
      registry.rs                 # Backend registry (pluggable providers)
      echo.rs                     # EchoBackend (NPC/fallback)
      copilot.rs                  # GitHub Copilot SDK backend
      openai_compat.rs            # OpenAI-compatible API backend
      tools.rs                    # Tool handlers (say, emote, move_to, run_away)
      responder.rs                # Legacy responder trait
```

## Simulation Engine

The simulation runs in a background thread at **20 Hz** (50 ms per tick). The `World` struct is behind `Arc<Mutex<...>>` for safe concurrent access from IPC handlers.

### Tick Loop

Each tick:

1. **Agent movement** — each agent picks random wander targets and walks toward them. Movement speed is determined by personality (`speed_min` to `speed_max`). When the target is reached, the agent idles briefly, then picks a new target.

2. **Mouse proximity** — agents within 80px of the cursor slow down (linearly interpolated from full speed to 10% speed).

3. **Ball chasing** — agents with `ball_interest > 0.3` chase the ball at `max_speed × ball_interest`. When an agent reaches the ball (within 15px), they capture it. After `ball_max_captures` (default 3), the ball deactivates. If `ball_kick_on_capture` is enabled, the capturing agent kicks the ball in a random direction.

4. **Agent-agent interactions** — when two agents are within 60px and off cooldown, they have a chance of interacting (based on averaged `interaction_chance`). On interaction, both display emoji bubbles and enter a 2.5s interaction state with a 5s cooldown.

5. **Ball physics** — gravity (400 px/s²), ground bounce (0.6 damping), wall bounce, friction (0.99 per tick, 0.92 on ground). Ball deactivates when speed drops below 0.5 px/s.

6. **Bubble decay** — chat and emoji bubbles tick down and are removed when expired.

7. **Event emission** — terrarium events (`BallThrown`, `AgentInteraction`, `AgentArrived`, etc.) are queued for the awareness dispatcher.

### Movement Styles

| Style | Behavior |
|-------|----------|
| `Wander` | Random targets on the ground plane, idle between moves |
| `Patrol` | Systematic traversal (future extension, currently wander-like) |
| `Bounce` | Personality flag (affects idle behavior) |
| `Float` | Bobs above the ground; can move vertically |

### Agent States

`Idle` → `Walking` → `Idle` (normal cycle). Also: `Running`, `Sprinting`, `Interacting`, `Chatting`, `NeedsAttention`. The `NeedsAttention` state freezes the agent until the user dismisses it.

## AI Backend System

Agent chat uses the **`AgentBackend`** trait — an async trait that any AI provider can implement:

```rust
#[async_trait]
pub trait AgentBackend: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    async fn respond(&self, agent_id: &str, config: &BackendConfig,
                     messages: &[ChatMessage]) -> Result<BackendResponse, String>;
    async fn destroy_chat_session(&self, agent_id: &str);
    async fn is_available(&self) -> bool;
    async fn list_models(&self) -> Vec<ModelOption>;
    async fn list_agents(&self, cwd: Option<&str>) -> Vec<AgentOption>;
    async fn set_api_key(&self, key: String);
    fn credential_key(&self) -> Option<&str>;
}
```

### Registered Backends

| Backend | ID | Description |
|---------|----|-------------|
| Echo | `echo` | Echoes user input; no API key needed. Default for NPC agents. |
| GitHub Copilot | `copilot` | Via Copilot SDK. Supports tool calling, model selection, custom agents. |
| OpenAI-compatible | `openai` | Works with OpenAI, Anthropic Claude, or any OpenAI-compatible endpoint. |

### Per-Agent Configuration

Each agent has a `BackendConfig`:

```rust
pub struct BackendConfig {
    pub backend_id: String,            // "echo", "copilot", "openai"
    pub model: Option<String>,
    pub awareness_model: Option<String>, // cheaper model for event reactions
    pub system_prompt: Option<String>,
    pub custom_agent: Option<String>,    // Copilot custom agent name
    pub awareness_level: u8,             // 0-3
    pub tts_enabled: bool,
    pub cwd: Option<String>,             // working directory for code agents
}
```

## Awareness & Event System

The awareness system lets agents observe and react to terrarium events autonomously.

### Event Types

| Event | Min Level | Trigger |
|-------|-----------|---------|
| `BallThrown` | 1 | User throws a ball |
| `BallCaught { agent }` | 1 | An agent catches the ball |
| `BallGone` | 2 | Ball reaches max captures |
| `AgentInteraction { a, b, emoji }` | 2 | Two agents interact |
| `AgentArrived { name }` | 1 | New agent added |
| `AgentLeft { name }` | 1 | Agent removed |
| `UserClickedAgent { name }` | 1 | User clicks an agent |

### Awareness Levels

| Level | Sees |
|-------|------|
| 0 | Direct chat messages only |
| 1 | Major events (ball, agents arriving/leaving, user clicks) |
| 2 | Social events (agent-agent interactions, gear/theme changes) |
| 3 | Full world state (periodic snapshots) |

### Event Dispatcher

A background async task polls events every 2 seconds. For each event, it:
1. Filters agents by awareness level
2. Applies a 15-second per-agent cooldown
3. Sends the event as natural language to the agent's backend
4. Processes the response — for Copilot (tool-capable), uses tools; for others, extracts emoji/text

### Agent Tools

Copilot-backed agents can call tools in response to events:

| Tool | Effect |
|------|--------|
| `say(text)` | Display a 10s speech bubble |
| `emote(emoji)` | Display a 3s emoji bubble |
| `move_to(target)` | Walk toward `"ball"`, `"mouse"`, `"center"`, or an agent name |
| `run_away(from)` | Flee in the opposite direction of a target |

## Rendering Pipeline

### Canvas Architecture

The frontend uses two canvas layers:
- **AnimatedBackground** — sky gradient, decorators, particles, ground, dynamic sky effects
- **TerrariumCanvas** — agents, ball, gear, chat bubbles, interaction indicators

Both render via `requestAnimationFrame` polling `get_world_state` from Rust.

### Perspective Scaling

Agents are drawn with perspective scaling: 1.0× at the horizon line (y = 72% of canvas height) scaling up to ~1.6× at the bottom. This creates a sense of depth.

### Dynamic Sky

When enabled, the dynamic sky system:
- Computes the current time of day (Night, Dawn, Morning, Noon, Afternoon, Dusk)
- Positions a sun/moon arc across the sky
- Interpolates sky colors and ground tints
- Overlays weather effects (rain, snow, fog, storms) from real weather data via the [Open-Meteo API](https://open-meteo.com/)

Weather is fetched on startup (IP-based geolocation) and refreshed every 6 hours.

### Theme Music

Each theme can define procedural 8-bit lofi music (BPM, key, scale, waveform, chord progression). Music is synthesized in real-time via the Web Audio API with separate melody and bass oscillators.

## IPC Commands

All frontend↔backend communication uses Tauri's IPC. Rust commands use `snake_case`; the frontend calls them in `camelCase` (Tauri auto-converts).

### World State
- `get_world_state()` → full snapshot every frame
- `resize_world(width, height)`
- `update_mouse(x, y)` → for hover slowdown

### Agents
- `add_agent(avatar, name)` → returns agent ID
- `remove_agent(agent_id)`
- `rename_agent(agent_id, name)`
- `set_gear(agent_id, gear_ids)`
- `set_backend_config(agent_id, config)`

### Chat
- `click_agent(agent_id)` → open chat session
- `send_message(agent_id, text)` → get AI response
- `dismiss_chat(agent_id)` / `clear_chat(agent_id)`
- `push_bubble(agent_id, content, is_emoji, duration)`

### Attention
- `request_attention(agent_id)` / `dismiss_attention(agent_id)`

### TTS
- `speak_sapi(text, voice_index, rate)` → Windows SAPI speech

### Backends & Credentials
- `list_backend_models(backend_id)` / `list_backend_agents(backend_id, cwd)`
- `set_credential(backend_id, key)` / `get_credential(backend_id)` / `delete_credential(backend_id)` / `has_credential(backend_id)`

### Config & Packages
- `save_config(...)` / `load_config()`
- `load_user_packages()` / `read_user_package_file(path)`
- `pick_folder()` → native folder picker dialog

## Configuration

App config is persisted to `~/agent-terrarium.json`:

```json
{
  "theme": "meadow",
  "agents": [
    {
      "avatar": "cat",
      "name": "Whiskers",
      "gear": ["crown"],
      "backend_config": { "backend_id": "echo", "awareness_level": 0 }
    }
  ],
  "window": { "x": 100, "y": 100, "width": 800, "height": 500 },
  "ball_max_captures": 3,
  "ball_kick_on_capture": true,
  "attention_interval_secs": 5.0,
  "music_muted": false,
  "dynamic_sky": true
}
```

Credentials (API keys) are stored separately via `tauri-plugin-store`.

## Key Dependencies

### Rust
- `tauri` 2 — desktop app framework
- `tokio` — async runtime
- `copilot-sdk` — GitHub Copilot integration
- `reqwest` — HTTP for OpenAI-compatible APIs
- `windows` 0.61 — Win32 SAPI for TTS
- `notify` — file system watcher (package hot-reload)
- `tauri-plugin-store` — credential storage
- `tauri-plugin-dialog` — native dialogs

### Frontend
- `react` 19 — UI framework
- `@tauri-apps/api` — IPC bridge
- `react-markdown` + `remark-gfm` — Markdown rendering in chat
- `vite` 7 — bundler with HMR
