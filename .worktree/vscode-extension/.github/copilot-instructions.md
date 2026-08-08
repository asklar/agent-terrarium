# Copilot Instructions for Agent Terrarium

## Build & Run Commands

```bash
pnpm install                  # Install dependencies
pnpm tauri dev                # Dev mode with hot-reload (starts Vite + Tauri)
pnpm tauri build              # Production build → src-tauri/target/release/bundle/

# Type checking (no linter configured)
npx tsc --noEmit              # Frontend TypeScript check
cargo check --manifest-path src-tauri/Cargo.toml  # Rust check
cargo fmt --manifest-path src-tauri/Cargo.toml     # Format Rust code
```

No test framework is configured for either the frontend or backend.

## Architecture

This is a **Tauri v2** desktop app: Rust backend + React/Canvas 2D frontend.

**The frontend is a pure view layer.** All simulation state and game logic lives in Rust. The React frontend polls Rust state via Tauri IPC every animation frame and renders to a `<canvas>`. User actions (click agent, throw ball, chat) are sent back to Rust as IPC commands.

Key data flow:
- `src-tauri/src/simulation/world.rs` — simulation engine, runs a tick loop at 20 Hz in a background thread
- `src-tauri/src/lib.rs` — Tauri `#[tauri::command]` handlers that bridge IPC to `World`
- `src/hooks/useWorldState.ts` — React hook that polls `get_world_state` via `requestAnimationFrame` and exposes IPC wrappers
- `src/components/TerrariumCanvas.tsx` — main Canvas 2D renderer

TypeScript types in `src/types/world.ts` must mirror the Rust structs in `src-tauri/src/simulation/types.rs` (both serialize via serde ↔ JSON). When changing one, update the other.

## Package System

Themes, agent avatars, and gear are **declarative JSON packages** loaded from `public/packages/`. The `PackageRegistry` singleton (`src/themes/registry.ts`) fetches them at startup.

- `src/themes/PackageTypes.ts` defines all package type interfaces
- Packages reference built-in rendering primitives by name (decorators, body shapes, gear shapes); unknown names are silently skipped for forward-compatibility
- To add a new theme: add an entry to `public/packages/themes.json` using decorator names from the `DECORATORS` map in `AnimatedBackground.tsx`
- To add a new agent avatar: add to `public/packages/agents.json`, create a draw function in `TerrariumCanvas.tsx`, and add a match arm in `create_agent()` in `world.rs`
- To add new gear: add to `public/packages/gear.json` and add a draw function in `TerrariumCanvas.tsx`

## Agent Framework

Agent chat uses the `AgentResponder` trait (`src-tauri/src/agents/responder.rs`). Currently uses `EchoResponder`. To integrate an LLM, implement `AgentResponder` and wire it into `World::send_message()`.

## Code Conventions

- **Rust**: use `rustfmt`. All simulation state is behind `Arc<World>` with internal `Mutex` locking.
- **TypeScript/React**: functional components with hooks. Use `useCallback` for event handlers. Canvas 2D for all rendering — no DOM-based sprites.
- **IPC naming**: Rust commands use `snake_case`, frontend `invoke()` calls use `camelCase` (Tauri auto-converts).
- **Config persistence**: app config saved to `~/agent-terrarium.json` via the `save_config`/`load_config` IPC commands.
- **Comments**: only where clarification is needed.
