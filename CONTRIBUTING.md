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

1. **Add the theme name** to the `ThemeName` union type in `src/components/AnimatedBackground.tsx`
2. **Add a theme entry** to the `THEMES` record with sky colors, ground colors, particle settings, and feature list
3. **Implement draw functions** for any new features (e.g., `drawMyFeature()`)
4. **Call your draw functions** in the render loop, gated by `t.features.includes("my_feature")`
5. **Add to the context menu** in `src/components/ContextMenu.tsx` — add an entry to the `THEMES` array

## How to Add a New Agent Avatar

### Frontend (sprite rendering)

1. **Add a color palette** in `src/components/AgentSprites.ts` with `body`, `head`, `eyes`, `accent`, and `cheek` colors
2. **Create a draw function** like `drawMyAgent()` in `src/components/TerrariumCanvas.tsx`
3. **Add a case** in the `drawAgent()` switch statement to call your function
4. **Add a voice profile** in the `VOICE_PROFILES` map in TerrariumCanvas for the Animalese greeting sound

### Backend (personality)

1. **Add a match arm** in `create_agent()` in `src-tauri/src/simulation/world.rs` with the avatar's default personality (speed, movement style, interaction chance, ball interest, emojis)

### Context menu

1. **Add an entry** to the `AVATARS` array in `src/components/ContextMenu.tsx`

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
  types/                      # TypeScript type definitions
src-tauri/                    # Rust backend
  src/
    lib.rs                    # Tauri command handlers
    simulation/               # World simulation engine
    agents/                   # Agent response framework
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes with minimal modifications
3. Ensure both `cargo check` and `npx tsc --noEmit` pass
4. Test with `pnpm tauri dev`
5. Open a PR with a clear description of what you changed and why

## Tips

- **Shift + right-click** opens the native browser context menu (useful for Inspect Element during development)
- The config file is saved at `~/agent-terrarium.json` — delete it to reset to defaults
- The simulation tick rate is 20 Hz but rendering runs at display refresh rate
- Agent positions are in world coordinates matching the window pixel dimensions
