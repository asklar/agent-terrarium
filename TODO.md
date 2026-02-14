# Agent Terrarium — TODO

Tracking remaining features, fixes, and enhancements.

## Fixes
- [x] **Context menu hover-to-open submenus** — hovering opens submenu after 120ms delay
- [x] **Restore native context menu in debug builds** — Shift+right-click opens native menu
- [x] **Agent hover slowdown** — agents slow down as mouse cursor approaches (80px radius)
- [x] **Chat input focus** — text input retains focus after agent reply

## New Themes
- [x] **Shooting stars in Night theme** — occasional shooting star streaks with glowing trails
- [x] **Forest at Dawn theme** — misty sunrise, tall trees, fireflies
- [x] **Castle theme** — stone walls, torches, banners, cobblestone ground

## Features
- [x] **Config persistence** — theme and agent list saved to `~/agent-terrarium.json`; loaded on startup
- [x] **Add/remove agents via context menu** — fully wired up with config save
- [ ] **System tray menu** — tray icon with Show/Hide, Settings, About, Quit
- [ ] **Auto-hide behavior** — window shrinks when mouse leaves, expands on hover
- [ ] **Pixel art sprite sheets** — proper animated sprite sheets for all agents (idle, walk, run, interact)
- [ ] **Animation polish** — smooth state transitions, dust puffs when running, sparkle on interaction, squash/stretch on ball bounce
- [ ] **Sound effects** — 8-bit sounds for interactions, ball throw, chat open (toggleable)

## Documentation
- [x] **README.md** — project overview, setup, architecture, controls, themes
- [x] **CONTRIBUTING.md** — dev setup, how to add themes/agents/LLM, code style, PR guide
