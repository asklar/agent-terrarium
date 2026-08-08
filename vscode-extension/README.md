# Agent Terrarium — VS Code Extension

A tiny animated world lives in your editor! AI agents wander, chat, play with balls, and interact with each other inside a miniature terrarium right in your VS Code sidebar.

## Features

- **Animated Agents** — Watch agents with unique personalities wander, interact, and play
- **Multiple Avatars** — Cat, Copilot, Squirrel, Penguin, Ghost, Clippy, and more
- **Chat with Agents** — Click an agent to start a conversation; supports multiple AI backends
- **Throw a Ball** — Toss a ball and watch agents chase it
- **File Drop** — Drop files into the terrarium for agents to pick up and discuss
- **Pop-out Chat** — Open any agent's chat in a separate editor tab
- **Themes** — Switch between visual themes (Default, Night, Beach, Space, and more)
- **Gear & Customization** — Equip agents with hats, accessories, and other gear
- **User Packages** — Add custom themes, avatars, and gear via JSON packages in `~/agent-terrarium/packages/`
- **Auto-reload** — User packages are watched and hot-reloaded on change
- **TTS Support** — Agents can speak their messages aloud using the Web Speech API
- **Cross-platform** — Works on Windows, macOS, and Linux

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type "Agent Terrarium":

| Command | Description |
|---------|-------------|
| `Agent Terrarium: Toggle Agent Terrarium` | Show/focus the terrarium panel |
| `Agent Terrarium: Add Agent` | Add a new agent with avatar selection |
| `Agent Terrarium: Change Theme` | Switch the visual theme |
| `Agent Terrarium: Throw Ball` | Throw a ball into the terrarium |

## Getting Started

1. Install the extension
2. The terrarium appears in the Explorer sidebar
3. Click an agent to start chatting
4. Use the Command Palette for more actions

## AI Backend Support

Agents can be powered by different AI backends:

- **Echo** (default) — Echoes back your message
- **GitHub Copilot** — Uses your Copilot subscription
- **OpenAI** — Bring your own API key

Configure backends per-agent through the agent config dialog.

## User Packages

Create custom content by placing JSON files in `~/agent-terrarium/packages/`:

- **Themes** — Custom backgrounds, decorators, and colors
- **Agent Avatars** — New agent types with custom personalities
- **Gear** — Hats, accessories, and cosmetic items

Changes are automatically detected and hot-reloaded.

## Requirements

- VS Code 1.100.0 or later

## License

MIT
