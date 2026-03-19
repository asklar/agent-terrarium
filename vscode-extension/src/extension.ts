import * as vscode from "vscode";
import { BackendRegistry } from "./agents/registry.js";
import { EchoBackend } from "./agents/echo.js";
import type { BackendConfig, BackendMessage } from "./agents/backend.js";
import {
  loadConfig,
  saveConfig,
  loadChatHistory,
  saveChatHistory,
  type AppConfig,
  type ChatMessage,
} from "./config.js";

// ── Lightweight simulation types (mirrors Rust WorldState) ──────────

interface Vec2 {
  x: number;
  y: number;
}

type AgentState =
  | "Idle"
  | "Walking"
  | "Running"
  | "Jumping"
  | "Chatting"
  | "NeedsAttention";

interface SimAgent {
  id: string;
  name: string;
  avatar: string;
  position: Vec2;
  velocity: Vec2;
  state: AgentState;
  direction: "Left" | "Right";
  stateTimer: number;
  gear: string[];
  backendConfig?: BackendConfig;
}

interface SimBall {
  position: Vec2;
  velocity: Vec2;
  active: boolean;
  height: number;
  heightVelocity: number;
}

interface SimChatBubble {
  agentId: string;
  content: string;
  timer: number;
  isEmoji: boolean;
}

interface SimWorldState {
  agents: SimAgent[];
  ball: SimBall | null;
  bubbles: SimChatBubble[];
  bounds: Vec2;
  tick: number;
}

// ── Minimal simulation engine ───────────────────────────────────────

const TICK_RATE = 1 / 20;
const GROUND_Y_RATIO = 0.85;

class World {
  agents: SimAgent[] = [];
  ball: SimBall | null = null;
  bubbles: SimChatBubble[] = [];
  bounds: Vec2 = { x: 300, y: 200 };
  tick = 0;
  chatSessions = new Map<string, ChatMessage[]>();

  private nextId = 1;

  addAgent(avatar: string, name: string): string {
    const id = `agent-${this.nextId++}`;
    const groundY = this.bounds.y * GROUND_Y_RATIO;
    this.agents.push({
      id,
      name,
      avatar,
      position: { x: Math.random() * this.bounds.x, y: groundY },
      velocity: { x: (Math.random() - 0.5) * 40, y: 0 },
      state: "Idle",
      direction: Math.random() > 0.5 ? "Right" : "Left",
      stateTimer: 0,
      gear: [],
    });
    return id;
  }

  removeAgent(agentId: string): void {
    this.agents = this.agents.filter((a) => a.id !== agentId);
    this.chatSessions.delete(agentId);
  }

  renameAgent(agentId: string, name: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) agent.name = name;
  }

  setGear(agentId: string, gearIds: string[]): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) agent.gear = gearIds;
  }

  setBackendConfig(agentId: string, config: BackendConfig): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) agent.backendConfig = config;
  }

  requestAttention(agentId: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) agent.state = "NeedsAttention";
  }

  dismissAttention(agentId: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent && agent.state === "NeedsAttention") agent.state = "Idle";
  }

  throwBall(x: number, y: number, vx: number, vy: number): void {
    this.ball = {
      position: { x, y },
      velocity: { x: vx, y: vy },
      active: true,
      height: 0,
      heightVelocity: -200,
    };
  }

  clickAgent(agentId: string): boolean {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) return false;
    agent.state = "Chatting";
    if (!this.chatSessions.has(agentId)) {
      const history = loadChatHistory(agentId);
      this.chatSessions.set(agentId, history);
    }
    return true;
  }

  dismissChat(agentId: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) agent.state = "Idle";
  }

  clearChat(agentId: string): void {
    this.chatSessions.set(agentId, []);
    saveChatHistory(agentId, []);
  }

  addUserMessage(agentId: string, text: string): void {
    const msgs = this.chatSessions.get(agentId) ?? [];
    msgs.push({ role: "user", content: text });
    this.chatSessions.set(agentId, msgs);
  }

  completeResponse(agentId: string, content: string): void {
    const msgs = this.chatSessions.get(agentId) ?? [];
    msgs.push({ role: "assistant", content });
    this.chatSessions.set(agentId, msgs);
    saveChatHistory(agentId, msgs);
  }

  getChatMessages(agentId: string): ChatMessage[] {
    return this.chatSessions.get(agentId) ?? [];
  }

  pushBubble(
    agentId: string,
    content: string,
    isEmoji: boolean,
    duration: number,
  ): void {
    this.bubbles.push({ agentId, content, timer: duration, isEmoji });
  }

  resize(width: number, height: number): void {
    this.bounds = { x: width, y: height };
  }

  // Main tick: simple wander + bubble decay
  doTick(): void {
    this.tick++;
    const groundY = this.bounds.y * GROUND_Y_RATIO;

    for (const agent of this.agents) {
      if (agent.state === "Chatting" || agent.state === "NeedsAttention")
        continue;

      agent.stateTimer -= TICK_RATE;

      if (agent.stateTimer <= 0) {
        // Pick new wander target
        agent.velocity.x = (Math.random() - 0.5) * 60;
        agent.stateTimer = 2 + Math.random() * 4;
        agent.state = agent.velocity.x !== 0 ? "Walking" : "Idle";
      }

      agent.position.x += agent.velocity.x * TICK_RATE;
      agent.position.y = groundY;
      agent.direction = agent.velocity.x >= 0 ? "Right" : "Left";

      // Clamp to bounds
      if (agent.position.x < 20) {
        agent.position.x = 20;
        agent.velocity.x = Math.abs(agent.velocity.x);
      }
      if (agent.position.x > this.bounds.x - 20) {
        agent.position.x = this.bounds.x - 20;
        agent.velocity.x = -Math.abs(agent.velocity.x);
      }
    }

    // Ball physics
    if (this.ball?.active) {
      this.ball.position.x += this.ball.velocity.x * TICK_RATE;
      this.ball.position.y += this.ball.velocity.y * TICK_RATE;
      this.ball.velocity.y += 400 * TICK_RATE; // gravity
      this.ball.velocity.x *= 0.99;

      if (this.ball.position.y >= groundY) {
        this.ball.position.y = groundY;
        this.ball.velocity.y *= -0.6;
        if (Math.abs(this.ball.velocity.y) < 5) {
          this.ball.active = false;
          this.ball = null;
        }
      }
    }

    // Bubble decay
    this.bubbles = this.bubbles.filter((b) => {
      b.timer -= TICK_RATE;
      return b.timer > 0;
    });
  }

  getState(): SimWorldState {
    return {
      agents: this.agents.map((a) => ({ ...a })),
      ball: this.ball ? { ...this.ball } : null,
      bubbles: [...this.bubbles],
      bounds: { ...this.bounds },
      tick: this.tick,
    };
  }

  loadFromConfig(config: AppConfig): void {
    for (const ac of config.agents) {
      const id = this.addAgent(ac.avatar, ac.name);
      const agent = this.agents.find((a) => a.id === id);
      if (agent) {
        agent.gear = ac.gear;
        if (ac.backendConfig) {
          agent.backendConfig = ac.backendConfig;
        }
      }
    }
  }
}

// ── Webview provider ────────────────────────────────────────────────

class TerrariumViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "agentTerrariumView";

  private view?: vscode.WebviewView;
  private tickInterval?: ReturnType<typeof setInterval>;
  private world: World;
  private registry: BackendRegistry;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.world = new World();
    this.registry = new BackendRegistry();
    this.registry.register(new EchoBackend());

    // Restore config
    const config = loadConfig();
    if (config) {
      this.world.loadFromConfig(config);
    }
    if (this.world.agents.length === 0) {
      this.world.addAgent("default", "Buddy");
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "media"),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg) =>
      this.handleMessage(msg),
    );

    // Start simulation tick loop (20 Hz = 50ms)
    this.tickInterval = setInterval(() => {
      this.world.doTick();
      this.pushState();
    }, 50);

    webviewView.onDidDispose(() => {
      if (this.tickInterval) clearInterval(this.tickInterval);
    });
  }

  private pushState(): void {
    this.view?.webview.postMessage({
      type: "worldState",
      state: this.world.getState(),
    });
  }

  private async handleMessage(msg: {
    type: string;
    [key: string]: unknown;
  }): Promise<void> {
    switch (msg.type) {
      case "throwBall":
        this.world.throwBall(
          msg.x as number,
          msg.y as number,
          msg.vx as number,
          msg.vy as number,
        );
        break;

      case "clickAgent":
        this.world.clickAgent(msg.agentId as string);
        break;

      case "dismissChat":
        this.world.dismissChat(msg.agentId as string);
        break;

      case "clearChat":
        this.world.clearChat(msg.agentId as string);
        break;

      case "sendMessage": {
        const agentId = msg.agentId as string;
        const text = msg.text as string;
        this.world.addUserMessage(agentId, text);

        const agent = this.world.agents.find((a) => a.id === agentId);
        const backendId = agent?.backendConfig?.backendId ?? "echo";
        const backend = this.registry.get(backendId) ?? this.registry.get("echo");
        if (backend) {
          const chatMsgs = this.world.getChatMessages(agentId);
          const backendMsgs: BackendMessage[] = chatMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const config: BackendConfig = agent?.backendConfig ?? {
            backendId: "echo",
            awarenessLevel: 0,
            ttsEnabled: false,
          };
          try {
            const resp = await backend.respond(agentId, config, backendMsgs);
            this.world.completeResponse(agentId, resp.content);
            this.world.pushBubble(agentId, resp.content, false, 5);
            if (resp.needsAttention) {
              this.world.requestAttention(agentId);
            }
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : "Unknown error";
            this.world.completeResponse(agentId, `Error: ${errMsg}`);
          }
        }
        break;
      }

      case "addAgent":
        this.world.addAgent(
          (msg.avatar as string) ?? "default",
          (msg.name as string) ?? "Agent",
        );
        break;

      case "removeAgent":
        this.world.removeAgent(msg.agentId as string);
        break;

      case "renameAgent":
        this.world.renameAgent(
          msg.agentId as string,
          msg.name as string,
        );
        break;

      case "setGear":
        this.world.setGear(
          msg.agentId as string,
          msg.gearIds as string[],
        );
        break;

      case "requestAttention":
        this.world.requestAttention(msg.agentId as string);
        break;

      case "dismissAttention":
        this.world.dismissAttention(msg.agentId as string);
        break;

      case "setBackendConfig":
        this.world.setBackendConfig(
          msg.agentId as string,
          msg.config as BackendConfig,
        );
        break;

      case "pushBubble":
        this.world.pushBubble(
          msg.agentId as string,
          msg.content as string,
          (msg.isEmoji as boolean) ?? false,
          (msg.duration as number) ?? 4,
        );
        break;

      case "resize":
        this.world.resize(msg.width as number, msg.height as number);
        break;

      case "ready":
        this.pushState();
        break;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Agent Terrarium</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
    #root { width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// ── Extension lifecycle ─────────────────────────────────────────────

let provider: TerrariumViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  provider = new TerrariumViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TerrariumViewProvider.viewType,
      provider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agent-terrarium.toggle", () => {
      vscode.commands.executeCommand("agentTerrariumView.focus");
    }),
  );
}

export function deactivate(): void {
  provider?.stop();
}
