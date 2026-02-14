# Agent Terrarium — TODO

Tracking remaining features, fixes, and enhancements.

## Fixes
- [x] **Context menu hover-to-open submenus** — click-only, no hover activation
- [x] **Restore native context menu in debug builds** — Shift+right-click opens native menu
- [x] **Agent hover slowdown** — agents slow down as mouse cursor approaches (80px radius)
- [x] **Chat input focus** — text input retains focus after agent reply
- [x] **Cape renders behind agent** — back-slot gear drawn before agent body
- [x] **Sunglasses position** — aligned with agent eye height
- [x] **Process exit on close** — `std::process::exit(0)` on window destroy
- [x] **Window position/size persistence** — saved/restored across sessions

## Themes
- [x] **Shooting stars in Night theme** — occasional shooting star streaks with glowing trails
- [x] **Forest at Dawn theme** — misty sunrise, tall trees, fireflies
- [x] **Castle theme** — stone walls, torches, banners, cobblestone ground
- [x] **Themes as declarative JSON packages** — loaded from `public/packages/themes.json`
- [x] **Lofi 8-bit music per theme** — procedural chiptune via Web Audio API, per-theme config

## Package System
- [x] **Package format** — declarative JSON manifests for themes, agents, and gear
- [x] **PackageRegistry** — singleton that dynamically loads packages from JSON at startup
- [x] **Built-in packages externalized** — `public/packages/{themes,agents,gear}.json`
- [x] **Agent avatars as packages** — shapes, colors, voice profiles, personalities in JSON
- [x] **Gear as packages** — accessories with slot system, SVG/PNG image support
- [ ] **Load external packages from disk** — scan `~/agent-terrarium/packages/` for user-installed JSON packages
- [ ] **Package install/remove UI** — context menu or settings to manage external packages

## Gear / Accessories
- [x] **Gear slot system** — hat, face, neck, body, back slots with correct draw order
- [x] **Gear equip/unequip** — toggle via context menu (Agent → Slot → Item)
- [x] **Gear persistence** — saved in config JSON and Rust Agent struct
- [x] **SVG/PNG gear images** — `image` field on GearDefinition, cached loading
- [x] **10 built-in gear items** — top hat, party hat, crown, wizard hat, flower crown, bow tie, scarf, sunglasses, cape, sweater

## Features
- [x] **Config persistence** — theme, agents, gear, window bounds in `~/agent-terrarium.json`
- [x] **Add/remove agents via context menu** — fully wired up with config save
- [x] **Close button in titlebar** — WindowFrame component
- [x] **Music mute/unmute** — toggle button in bottom-right corner
- [ ] **System tray menu** — tray icon with Show/Hide, Settings, About, Quit
- [ ] **Auto-hide behavior** — window shrinks when mouse leaves, expands on hover
- [ ] **Pixel art sprite sheets** — proper animated sprite sheets for all agents (idle, walk, run, interact)
- [ ] **Animation polish** — smooth state transitions, dust puffs when running, sparkle on interaction, squash/stretch on ball bounce
- [ ] **Sound effects** — 8-bit sounds for interactions, ball throw, chat open (toggleable)
- [ ] **Agent chat with LLM** — wire AgentResponder trait to real LLM backend (currently echo)

## Documentation
- [x] **README.md** — project overview, setup, architecture, controls, themes, package system
- [x] **CONTRIBUTING.md** — dev setup, how to add themes/agents/gear/LLM, code style, PR guide
