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
git clone https://github.com/asklar/agent-terrarium.git
cd agent-terrarium
pnpm install
pnpm tauri dev
```

The app will launch with hot-reload. Rust changes trigger a recompile; frontend changes hot-reload instantly.

### Type Checking

```bash
npx tsc --noEmit                                    # Frontend TypeScript
cargo check --manifest-path src-tauri/Cargo.toml     # Rust backend
```

No test framework is configured for either frontend or backend.

## Architecture Overview

See [Architecture](docs/architecture.md) for a full technical deep-dive.

The short version:
- **Rust backend** (`src-tauri/src/`): Owns all simulation state. Runs a tick loop at 20 Hz. Exposes state via Tauri IPC commands.
- **React frontend** (`src/`): Polls the Rust state each frame and renders to Canvas 2D. Handles input and sends commands back to Rust.

The frontend is a pure view layer — it reads state, draws it, and sends user actions. All game logic lives in Rust.

**Important**: TypeScript types in `src/types/world.ts` must mirror the Rust structs in `src-tauri/src/simulation/types.rs`. When changing one, update the other.

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
`clouds`, `moon`, `stars`, `shooting_stars`, `waves`, `seaweed`, `flowers`, `grass`, `cactus`, `trees`, `mist`, `fireflies`, `castle_walls`, `torches`, `banners`, `nebula`, `planets`, `space_dust`, `distant_star`, `galaxy`

To add a **new decorator** (custom draw function):
1. Write the draw function in `src/components/AnimatedBackground.tsx`
2. Add it to the `DECORATORS` map with a unique name
3. Reference it from your theme's `decorators` array

Themes with custom assets (SVG backgrounds, animated elements) should be placed in their own subdirectory under `packages/` — see `packages/seattle/` for an example.

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
  "personality": { "speedMin": 40, "speedMax": 140, "movementStyle": "bounce", "interactionChance": 0.6, "ballInterest": 0.7, "chatEmojis": ["🐰", "🥕", "✨"] },
  "drawSpec": {
    "layers": [
      { "type": "legs", "color": "#C8A080", "spread": 4, "length": 7, "footStyle": "round" },
      { "type": "body", "color": "#E0C8A0", "rx": 10, "ry": 11 },
      { "type": "head", "color": "#F0D8B0", "rx": 10, "ry": 10 },
      { "type": "ears", "style": "round", "color": "#F0D8B0", "size": 14, "innerColor": "#FFB0B0" },
      { "type": "eyes", "style": "standard", "color": "#333", "size": 2.5 },
      { "type": "nose", "color": "#C8A080", "rx": 2, "ry": 1.5 },
      { "type": "cheeks", "color": "#FFB0B0" },
      { "type": "mouth", "style": "small" }
    ]
  }
}
```

### Frontend (sprite rendering)

1. **Create a draw function** like `drawBunny()` in `src/components/TerrariumCanvas.tsx`
2. **Add a case** in the `drawAgent()` switch statement matching the `shape` id

### Backend (personality)

1. **Add a match arm** in `create_agent()` in `src-tauri/src/simulation/world.rs` with the avatar's default personality

### Context menu

Agents are automatically listed in the context menu from the package registry — no manual wiring needed.

## How to Add a New AI Backend

The agent chat system uses the `AgentBackend` trait:

```rust
// src-tauri/src/agents/backend.rs
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

To add a new backend:
1. Create a new file in `src-tauri/src/agents/` (e.g., `my_backend.rs`) implementing `AgentBackend`
2. Register it in `src-tauri/src/agents/registry.rs`
3. Add the backend ID to the frontend's `AgentConfigDialog.tsx` dropdown

Currently registered backends: `echo` (NPC), `copilot` (GitHub Copilot SDK), `openai` (OpenAI-compatible).

## How to Add New Gear

Add a gear entry to `public/packages/gear.json`:

```json
{
  "id": "monocle",
  "name": "Monocle",
  "icon": "🧐",
  "slot": "face",
  "shape": "sunglasses",
  "color": "#CFB53B",
  "accentColor": "#FFD700"
}
```

For custom image-based gear, use the `image` field with a URL to an SVG or PNG file. See the [Extension Authoring Guide](docs/extensions.md) for full gear documentation.

## Code Style

- **Rust**: Standard `rustfmt` formatting. Run `cargo fmt --manifest-path src-tauri/Cargo.toml` before committing.
- **TypeScript/React**: No explicit linter configured. Follow existing patterns:
  - Functional components with hooks
  - `useCallback` for event handlers
  - Canvas 2D for rendering (no DOM-based sprites)
- **Comments**: Only where clarification is needed. Don't over-comment.
- **IPC naming**: Rust commands use `snake_case`. Frontend `invoke()` calls use `camelCase` (Tauri auto-converts).
- **Commits**: Use clear, descriptive messages. Include `Co-authored-by` trailer if using AI assistance.

## Building an Installable Version

```bash
pnpm tauri build
```

This compiles the Rust backend in release mode and bundles the frontend. Output:

```
src-tauri/target/release/bundle/
├── msi/          # Windows MSI installer
└── nsis/         # NSIS .exe installer
```

### Build prerequisites

- Everything from [Development Setup](#development-setup)
- **WiX Toolset v3** (for MSI) — `winget install FireGiant.WiX`
- **NSIS** (for .exe installer) — `winget install NSIS.NSIS`

You only need one of WiX or NSIS. The build produces whichever toolset it finds.

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
- The debug panel (right-click → Debug) lets you override time of day and weather for testing themes
