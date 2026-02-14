# 🌿 Agent Terrarium

A cute, persistent desktop companion app where AI agents live in a tiny animated world on your screen. Think Stardew Valley meets desktop pets — agents wander, interact with each other, and chat with you.

<p align="center">

https://github.com/asklar/agent-terrarium/raw/main/Agent-terrarium-480.mp4

</p>

Built with **Tauri v2** (Rust backend) + **React** (Canvas 2D frontend).

## ✨ Features

- **Animated agents** — Cat, Copilot, Squirrel, Penguin, and Ghost with unique sprites, personalities, and movement styles
- **Agent interactions** — agents greet each other with emoji chat bubbles when they meet
- **Chat with agents** — click an agent to open a chat bubble and talk to them (agent framework ready for LLM integration)
- **Throw a ball** — click and drag to throw a ball; agents will chase it based on their personality
- **Hover greetings** — hover over an agent to hear a synthesized "Animalese" voice and see a mood-based emoji
- **Hover slowdown** — agents slow down as your cursor approaches them
- **6 animated themes** — Meadow, Night (with shooting stars!), Desert, Ocean, Forest at Dawn, and Castle
- **Context menu** — right-click to change themes, add/remove agents
- **Config persistence** — theme and agent list saved to `~/agent-terrarium.json`
- **Always-on-top transparent window** — frameless, resizable, draggable overlay

## 🏗️ Architecture

```
┌──────────────────────────────────────┐
│  React + Canvas 2D (renderer)        │
│  - TerrariumCanvas (agents, ball)    │
│  - AnimatedBackground (themes)       │
│  - ChatOverlay, ContextMenu          │
├──────────────────────────────────────┤
│  Tauri IPC (JSON commands)           │
├──────────────────────────────────────┤
│  Rust Simulation Engine              │
│  - World (tick loop @ 20Hz)          │
│  - Agent movement, interactions      │
│  - Ball physics, chat sessions       │
│  - AgentResponder trait (echo/LLM)   │
└──────────────────────────────────────┘
```

The architecture is **renderer-agnostic**: all simulation state lives in Rust. The React/Canvas frontend is just a view layer that polls state via IPC. A future WinUI3 + Win2D renderer can swap in without changing the backend.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 8
- [Rust](https://rustup.rs/) ≥ 1.70
- Windows 10/11 (primary target), macOS/Linux may work with minor adjustments

### Setup

```bash
git clone https://github.com/user/agent-terrarium.git
cd agent-terrarium
pnpm install
```

### Development

```bash
pnpm tauri dev
```

This starts both the Vite dev server and the Tauri app with hot-reload.

### Build

```bash
pnpm tauri build
```

Produces an installer in `src-tauri/target/release/bundle/`.

## 🎮 Controls

| Action | How |
|--------|-----|
| Move window | Drag the title bar |
| Resize window | Drag any edge or corner |
| Chat with agent | Click on an agent |
| Throw ball | Click and drag on the background |
| Change theme | Right-click → Theme |
| Add/remove agents | Right-click → Add/Remove Agent |
| Native context menu | Shift + right-click |
| Close | Click ✕ in title bar |

## 📁 Project Structure

```
src/                          # React frontend
  components/
    TerrariumCanvas.tsx       # Main canvas renderer (agents, ball, bubbles)
    AnimatedBackground.tsx    # Theme backgrounds (6 themes)
    ChatOverlay.tsx           # Agent chat UI
    ContextMenu.tsx           # Right-click menu
    WindowFrame.tsx           # Drag region + resize handles
    AgentSprites.ts           # Agent color palettes (legacy fallback)
  themes/
    PackageTypes.ts           # Package, ThemeDefinition, AgentDefinition types
    builtins.ts               # Built-in theme and agent packages
    registry.ts               # PackageRegistry singleton
    index.ts                  # Barrel export
  hooks/
    useWorldState.ts          # Tauri IPC polling hook
  types/
    world.ts                  # TypeScript types mirroring Rust
src-tauri/                    # Rust backend
  src/
    lib.rs                    # Tauri commands
    simulation/
      types.rs                # Vec2, Agent, WorldState, etc.
      world.rs                # Simulation engine (tick loop, movement, physics)
    agents/
      responder.rs            # AgentResponder trait + EchoResponder
```

## 🎨 Themes

| Theme | Description |
|-------|-------------|
| 🌿 Meadow | Green hills, clouds, flowers, falling leaves |
| 🌙 Night | Starry sky, moon, twinkling stars, shooting stars |
| 🏜️ Desert | Orange sunset, cacti, blowing sand |
| 🌊 Ocean | Deep blue, waves, bubbles, seaweed |
| 🌅 Forest at Dawn | Misty sunrise, tall trees, fireflies |
| 🏰 Castle | Stone walls, torches, banners, cobblestone |

## 📦 Package System

Themes and agent avatars are defined as **declarative packages** — pure data objects that reference built-in rendering primitives by name. This means:

- **Themes** specify colors, gradients, particle settings, and a list of "decorator" names (e.g. `"clouds"`, `"torches"`, `"fireflies"`)
- **Agent avatars** specify color palettes, voice profiles, body shape names, and default personality values
- **External packages** can be loaded from JSON files to add new themes and agents without modifying the app

See `src/themes/PackageTypes.ts` for the full type definitions. Example theme package:

```json
{
  "version": 1,
  "name": "My Custom Theme Pack",
  "themes": [{
    "id": "my-theme",
    "name": "My Theme",
    "icon": "🎪",
    "sky": ["#1a1a2e", "#16213e"],
    "ground": "#4a3c2a",
    "groundAccent": "#3d3020",
    "particles": { "type": "star", "color": "#FFD700", "count": 20 },
    "decorators": ["stars", "moon"]
  }]
}
```

## 🤖 Agent Framework

Agents use the `AgentResponder` trait (in `src-tauri/src/agents/responder.rs`):

```rust
pub trait AgentResponder: Send + Sync {
    fn respond(&self, agent_id: &str, message: &str) -> String;
}
```

Currently uses `EchoResponder` (echoes input). To integrate an LLM, implement this trait with your API calls.

## 📄 License

MIT
