# Contributing to Agent Terrarium

Thanks for your interest in contributing! This guide covers how to set up the project, make changes, and submit them.

## Development Setup

### Prerequisites

- **Node.js** ≥ 18 and **pnpm** ≥ 8
- **Rust** ≥ 1.70 (install via [rustup](https://rustup.rs/))
- **Windows 10/11** — the primary target platform
- A code editor with Rust and TypeScript support (VS Code with rust-analyzer recommended)

### Getting Started

```bash
git clone https://github.com/user/agent-terrarium.git
cd agent-terrarium
pnpm install
pnpm tauri dev
```

The app will launch with hot-reload. Rust changes trigger a recompile; frontend changes hot-reload instantly.

## Architecture Overview

The app uses a **renderer-agnostic** architecture:

- **Rust backend** (`src-tauri/src/`): Owns all simulation state. Runs a tick loop at 20 Hz. Exposes state via Tauri IPC commands.
- **React frontend** (`src/`): Polls the Rust state each frame and renders to Canvas 2D. Handles input and sends commands back to Rust.

This means the frontend is a pure view layer — it reads state, draws it, and sends user actions. All game logic lives in Rust.

## How to Add a New Theme

Themes are declarative JSON packages. Add a new theme by creating a JSON file or adding an entry to `public/packages/themes.json`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "icon": "🎪",
  "sky": ["#1a1a2e", "#16213e"],
  "ground": "#4a3c2a",
  "groundAccent": "#3d3020",
  "particles": { "type": "star", "color": "#FFD700", "count": 20 },
  "decorators": ["stars", "moon", "clouds"]
}
```

The `decorators` array references built-in draw functions by name. Available decorators:
`clouds`, `moon`, `stars`, `shooting_stars`, `waves`, `seaweed`, `flowers`, `grass`, `cactus`, `trees`, `mist`, `fireflies`, `castle_walls`, `torches`, `banners`

To add a **new decorator** (custom draw function):
1. Write the draw function in `src/components/AnimatedBackground.tsx`
2. Add it to the `DECORATORS` map with a unique name
3. Reference it from your theme's `decorators` array

## How to Add a New Agent Avatar

### Package definition

Add an agent entry to `public/packages/agents.json` (or create a new package JSON):

```json
{
  "id": "bunny",
  "name": "Bunny",
  "icon": "🐰",
  "shape": "bunny",
  "colors": { "body": "#E0C8A0", "head": "#F0D8B0", "eyes": "#333", "accent": "#C8A080", "cheek": "#FFB0B0" },
  "voice": { "basePitch": 800, "pitchVar": 120, "wave": "triangle", "syllables": 3, "speed": 0.06, "volume": 0.09 },
  "personality": { "speedMin": 40, "speedMax": 140, "movementStyle": "bounce", "interactionChance": 0.6, "ballInterest": 0.7, "chatEmojis": ["🐰", "🥕", "✨"] }
}
```

### Frontend (sprite rendering)

1. **Create a draw function** like `drawBunny()` in `src/components/TerrariumCanvas.tsx`
2. **Add a case** in the `drawAgent()` switch statement matching the `shape` id

### Backend (personality)

1. **Add a match arm** in `create_agent()` in `src-tauri/src/simulation/world.rs` with the avatar's default personality

### Context menu

Agents are automatically listed in the context menu from the package registry — no manual wiring needed.

## How to Integrate an LLM

The agent chat system uses the `AgentResponder` trait:

```rust
// src-tauri/src/agents/responder.rs
pub trait AgentResponder: Send + Sync {
    fn respond(&self, agent_id: &str, message: &str) -> String;
}
```

To connect an LLM:

1. Create a new struct implementing `AgentResponder` (e.g., `LlmResponder`)
2. Make the `respond` method call your LLM API
3. Wire it into `World::send_message()` instead of the current `EchoResponder`

## Code Style

- **Rust**: Standard `rustfmt` formatting. Run `cargo fmt` before committing.
- **TypeScript/React**: No explicit linter configured yet. Follow existing patterns:
  - Functional components with hooks
  - `useCallback` for event handlers
  - Canvas 2D for rendering (no DOM-based sprites)
- **Comments**: Only where clarification is needed. Don't over-comment.
- **Commits**: Use clear, descriptive messages. Include `Co-authored-by` trailer if using AI assistance.

## Project Structure

```
src/                          # React frontend
  components/                 # UI components
  hooks/                      # React hooks (IPC polling)
  themes/                     # Package type definitions + registry
  types/                      # TypeScript type definitions
public/
  packages/                   # Built-in package JSON files (themes, agents, gear)
src-tauri/                    # Rust backend
  src/
    lib.rs                    # Tauri command handlers
    simulation/               # World simulation engine
    agents/                   # Agent response framework
  capabilities/               # Tauri permission grants
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes with minimal modifications
3. Ensure both `cargo check` and `npx tsc --noEmit` pass
4. Test with `pnpm tauri dev`
5. Open a PR with a clear description of what you changed and why

## Building an Installable Version

To create a distributable installer (`.msi` or `.exe` on Windows):

```bash
pnpm tauri build
```

This compiles the Rust backend in release mode and bundles the frontend. Output artifacts are placed in:

```
src-tauri/target/release/bundle/
├── msi/          # Windows MSI installer
└── nsis/         # NSIS .exe installer
```

### Build prerequisites

- Everything from [Development Setup](#development-setup)
- **WiX Toolset v3** (for MSI) — install via `winget install FireGiant.WiX` or download from [wixtoolset.org](https://wixtoolset.org/)
- **NSIS** (for .exe installer) — install via `winget install NSIS.NSIS` or download from [nsis.sourceforge.io](https://nsis.sourceforge.io/)

You only need one of WiX or NSIS. The build will produce whichever toolset it finds.

### Release builds

For a clean release build with optimizations:

```bash
pnpm tauri build --release
```

The resulting installer can be distributed and installed on any Windows 10/11 machine without needing Rust or Node.js.

## Tips

- **Shift + right-click** opens the native browser context menu (useful for Inspect Element during development)
- The config file is saved at `~/agent-terrarium.json` — delete it to reset to defaults
- The simulation tick rate is 20 Hz but rendering runs at display refresh rate
- Agent positions are in world coordinates matching the window pixel dimensions
