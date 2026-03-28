# Agent Terrarium — TODO

Tracking remaining features, fixes, and enhancements.

---

## ✅ Completed

<details>
<summary>Click to expand completed items</summary>

### Fixes
- [x] Context menu hover-to-open submenus — click-only, no hover activation
- [x] Restore native context menu in debug builds — Shift+right-click opens native menu
- [x] Agent hover slowdown — agents slow down as mouse cursor approaches (80px radius)
- [x] Chat input focus — text input retains focus after agent reply
- [x] Cape renders behind agent — back-slot gear drawn before agent body
- [x] Sunglasses position — aligned with agent eye height
- [x] Process exit on close — `std::process::exit(0)` on window destroy
- [x] Window position/size persistence — saved/restored across sessions
- [x] Ball physics — gravity, ground bounce, wall bounce, damping, friction
- [x] Ball capture/kick — agents capture ball, kick it away, configurable max captures
- [x] Config auto-restore on startup — agents, gear, settings loaded from disk
- [x] Empty terrarium on fresh install — user adds agents via context menu

### Themes & Music
- [x] 6 animated themes (Meadow, Night, Desert, Ocean, Forest, Castle)
- [x] Shooting stars in Night theme
- [x] Themes as declarative JSON packages
- [x] Lofi 8-bit procedural music per theme
- [x] Music auto-start with autoplay policy handling

### Package System
- [x] Package format — JSON manifests for themes, agents, gear
- [x] PackageRegistry with async loading
- [x] Built-in packages externalized to `public/packages/*.json`
- [x] User packages loaded from `~/agent-terrarium/packages/`
- [x] Agent avatars as packages (shapes, colors, voice, personality)
- [x] Gear as packages with slot system + SVG/PNG support

### Gear / Accessories
- [x] 5 gear slots (hat, face, neck, body, back) with correct draw order
- [x] Gear equip/unequip via context menu
- [x] Gear persistence in config
- [x] 10 built-in gear items
- [x] Gear equip emote + sound

### Sound System
- [x] Differentiated agent sounds (hover/chat/capture/gear/attention moods)
- [x] Ball kick and bounce sound effects
- [x] Ball capture celebration arpeggio
- [x] Attention system — taskbar flash, periodic sound, visual indicator

### UI
- [x] Splash screen with fade in/out, minimum 2s, `--splash-wait` CLI flag
- [x] Close button in titlebar
- [x] Music mute/unmute toggle
- [x] Demo GIF in README
- [x] CI workflow (TypeScript + Rust + frontend build)

</details>

---

## 🔥 Agent Framework Integration (Big Feature)

The core differentiator: agents in the terrarium are backed by **real AI agent frameworks**. Each avatar maps to a specific backend provider.

### Architecture: Avatar vs Agent

- **Avatar** = visual representation in the terrarium (pixels, animations, personality, gear)
- **Agent** = the backing AI framework (Copilot SDK, Claude Code, OpenClaw, MSAF, etc.)
- Each avatar has an optional `agent_backend` config that determines how chat/tasks work
- Avatars without a backend are NPCs (cosmetic, pre-scripted responses)

### Pluggable Backend System
- [ ] **Agent backend trait** — extend `AgentResponder` to async trait with streaming support, tool use results, and task lifecycle (start/progress/complete/error)
- [ ] **Backend registry** — pluggable backend providers, registered by ID (e.g. `"copilot"`, `"claude"`, `"openclaw"`, `"msaf"`)
- [ ] **Per-avatar backend config** — each avatar's JSON config includes `backend_id`, `model`, `system_prompt`, and `api_key_ref` (reference to secure storage, never plaintext)
- [ ] **Credential management** — secure storage for API keys/tokens (Tauri keyring plugin or OS credential store)

### Supported Backends
- [ ] **GitHub Copilot** — via Copilot SDK; chat, code generation, PR summaries
- [ ] **Claude Code** — via Anthropic SDK; general chat, analysis, tool use
- [ ] **OpenClaw** — open-source agent framework integration
- [ ] **Microsoft Agent Framework (MSAF)** — via MSAF SDK; enterprise agents, tool orchestration
- [ ] **Echo/NPC backend** — built-in, for cosmetic agents with scripted personality responses

### Agent Awareness Levels (per-avatar setting)
- [ ] **Level 0 — Chat only** — agent only receives direct user messages
- [ ] **Level 1 — Major events** — agent also sees: new agents added/removed, ball thrown, attention requests
- [ ] **Level 2 — Social** — agent also sees: agent-agent interactions, gear changes, theme changes
- [ ] **Level 3 — Full awareness** — periodic world state snapshots (throttled, e.g. every 30s)
- [ ] **Event feed** — internal event bus that collects terrarium events; each agent subscribes at their configured level

### Agent Lifecycle
- [ ] **Task system** — agents can have active tasks (long-running); avatar shows progress indicator (spinning gear, progress bar, etc.)
- [ ] **Request attention** — agent backend can signal "needs attention" → avatar stops, taskbar flashes, sound plays (already wired!)
- [ ] **Proactive messages** — agent can initiate conversation (not just respond); shows chat bubble unprompted
- [ ] **Streaming responses** — chat responses stream in token-by-token with typing indicator

---

## 🎮 UX & Engagement

### Avatar Moods & Emotions
- [ ] **Mood system** — each avatar has a current mood (happy, bored, excited, sleepy, focused, confused) that affects animations, movement, and sound
- [ ] **Mood triggers** — mood changes based on: time of day, user interaction frequency, ball play, gear changes, other agent interactions
- [ ] **Idle behaviors** — bored agents yawn, sleepy agents nod off, happy agents dance/spin, excited agents bounce
- [ ] **Mood indicator** — subtle visual cue (face expression change, particle effects, or status icon)

### Social Dynamics
- [ ] **Agent friendships** — agents that interact often build friendship; they seek each other out, share emojis, walk together
- [ ] **Agent rivalries** — configurable; some agents playfully compete (ball stealing, showing off gear)
- [ ] **Group behaviors** — 3+ agents near each other trigger group activities (huddle, circle dance, etc.)
- [ ] **Agent gifting** — agents can "give" gear items to each other (cosmetic, with animation)

### Mini-Games & Activities
- [ ] **Fetch** — throw ball, agent retrieves it and brings it back to cursor (not just chase)
- [ ] **Hide and seek** — one agent hides (goes semi-transparent/behind objects), others search
- [ ] **Races** — agents line up and sprint across the terrarium; user can bet/cheer
- [ ] **Obstacle course** — place obstacles (configurable), agents navigate them
- [ ] **Dance party** — music tempo increases, all agents do synchronized dance moves

### Time & Seasons
- [ ] **Day/night cycle** — terrarium background shifts with real time (or configurable accelerated time)
- [ ] **Seasonal themes** — auto-switch themes based on date (spring meadow, summer ocean, fall forest, winter night)
- [ ] **Holiday events** — special decorations, gear, and agent behaviors for holidays (Halloween costumes, winter hats, etc.)
- [ ] **Sleep schedule** — agents "sleep" at night (curled up, z-bubbles), configurable per agent

### Collectibles & Progression
- [ ] **Achievement system** — earn badges for milestones (first chat, 100 ball throws, all gear collected, etc.)
- [ ] **Unlockable gear** — some gear items unlock after achievements or time played
- [ ] **Agent experience** — agents "level up" from interactions, gaining new idle animations or emojis
- [ ] **Collection log** — track which gear, themes, and achievements you've discovered

### Notifications & Ambient Info
- [ ] **Agent announcements** — agents occasionally share random fun facts, quotes, or jokes via chat bubbles (configurable frequency)
- [ ] **Clock widget** — tiny clock in terrarium corner (optional)
- [ ] **Weather widget** — agents react to real weather (umbrella gear when raining, etc.)
- [ ] **Pomodoro mode** — agents encourage focus during work intervals, celebrate during breaks

---

## 🖥️ Window & System

- [ ] **System tray menu** — tray icon with Show/Hide, Settings, About, Quit
- [ ] **Auto-hide behavior** — window shrinks/fades when mouse leaves, expands on hover
- [ ] **Multi-monitor support** — remember which monitor the terrarium lives on
- [ ] **Click-through mode** — toggle: window passes clicks through to apps below
- [ ] **Always-on-bottom mode** — terrarium sits on desktop wallpaper layer (like Wallpaper Engine)
- [ ] **Resize handles** — visual resize grip corners
- [ ] **Settings panel** — in-app settings UI (not just context menu) for all config options
- [ ] **Hotkey support** — global hotkeys to toggle visibility, throw ball, open chat with last agent

---

## 🎨 Art & Animation

- [ ] **Pixel art sprite sheets** — proper animated sprite sheets for all agents (idle, walk, run, interact, sleep, dance)
- [ ] **Animation polish** — squash/stretch on jump/land, dust puffs when running, sparkle on interaction
- [ ] **Particle system** — reusable particle emitter for confetti, sparkles, dust, rain, snow
- [ ] **Custom avatar creator** — simple pixel editor or upload sprite sheet for custom agent appearances
- [ ] **Emote animations** — animated emoji/emote sequences (not just static bubbles)
- [ ] **Speech bubble styles** — different bubble shapes per agent personality (round, spiky, thought cloud)

---

## 📦 Package System Enhancements

- [ ] **Package install/remove UI** — context menu or settings panel to manage packages
- [ ] **Package marketplace** — browse/install community packages from a central repo (GitHub-based?)
- [ ] **Package versioning** — version field, upgrade/downgrade support
- [ ] **Theme packs** — bundled theme + music + matching gear + matching agent skins
- [ ] **Community sharing** — export your agent config (gear, name, personality) as shareable JSON

---

## 📖 Documentation

- [x] README.md — project overview, setup, architecture, controls, demo GIF
- [x] CONTRIBUTING.md — dev setup, build instructions, package system docs
- [ ] **Agent backend dev guide** — how to implement a new backend provider
- [ ] **Package authoring guide** — detailed guide for creating themes, agents, and gear packs
- [ ] **Architecture docs** — avatar vs agent, event bus, backend lifecycle diagrams
