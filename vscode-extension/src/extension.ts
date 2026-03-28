import * as vscode from "vscode";
import { BackendRegistry } from "./agents/registry.js";
import { EchoBackend } from "./agents/echo.js";
import type { BackendConfig, BackendMessage } from "./agents/backend.js";
import {
  loadConfig,
  saveConfig,
  loadChatHistory,
  saveChatHistory,
  userPackagesDir,
  type AppConfig,
  type ChatMessage,
  type AgentConfig as ConfigAgentConfig,
} from "./config.js";
import { startPackageWatcher, stopPackageWatcher } from "./packageWatcher.js";
import { getFileIconDataUrl } from "./fileIcons.js";

// Optional imports for modules that may still be in progress
let VsCodeLmBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let OpenAIBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let OllamaBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let AnthropicBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let ClaudeCodeBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let CopilotSdkBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let EventDispatcher: (new (world: World, registry: BackendRegistry) => { start(): void; stop(): void }) | undefined;

try { VsCodeLmBackend = require("./agents/vscodeLm.js").VsCodeLmBackend; } catch {}
try { OpenAIBackend = require("./agents/openai.js").OpenAIBackend; } catch {}
try { OllamaBackend = require("./agents/ollama.js").OllamaBackend; } catch {}
try { AnthropicBackend = require("./agents/anthropic.js").AnthropicBackend; } catch {}
try { ClaudeCodeBackend = require("./agents/claudeCode.js").ClaudeCodeBackend; } catch {}
try { CopilotSdkBackend = require("./agents/copilotSdk.js").CopilotSdkBackend; } catch {}
try { EventDispatcher = require("./eventDispatcher.js").EventDispatcher; } catch {}

// Optional utility modules
let fetchLocation: (() => Promise<unknown>) | undefined;
let fetchWeather: ((lat: number, lon: number) => Promise<unknown>) | undefined;
let loadUserPackages: (() => string[]) | undefined;

try {
  const weather = require("./weather.js");
  fetchLocation = weather.fetchLocation;
  fetchWeather = weather.fetchWeather;
} catch {}

try {
  loadUserPackages = require("./packages.js").loadUserPackages;
} catch {}

import { World } from "./simulation/world.js";
import { Vec2, AgentState } from "./simulation/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Logging ─────────────────────────────────────────────────────────

let outputChannel: vscode.OutputChannel;

function log(msg: string): void {
  const ts = new Date().toISOString();
  outputChannel?.appendLine(`[${ts}] ${msg}`);
}

// ── Webview provider ────────────────────────────────────────────────

class TerrariumViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "agentTerrariumView";

  private view?: vscode.WebviewView;
  private tickInterval?: ReturnType<typeof setInterval>;
  private world: World;
  private registry: BackendRegistry;
  private secrets: vscode.SecretStorage;
  private eventDispatcherInstance?: { start(): void; stop(): void };
  private popOutPanels: Map<string, vscode.WebviewPanel> = new Map();
  private notifiedAttentionAgents: Set<string> = new Set();
  private packagesBaseUri = "";
  private userPackagesBaseUri = "";

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.secrets = context.secrets;
    this.world = new World(Vec2.new(300, 200));
    log("World created (300x200)");
    this.registry = new BackendRegistry();
    this.registry.register(new EchoBackend());
    log("Registered echo backend");

    // Register optional backends
    if (CopilotSdkBackend) {
      try { this.registry.register(new CopilotSdkBackend()); log("Registered copilot backend"); } catch (e) { log(`Failed to register copilot: ${e}`); }
    }
    if (VsCodeLmBackend) {
      try { this.registry.register(new VsCodeLmBackend()); log("Registered vscode-lm backend"); } catch (e) { log(`Failed to register vscode-lm: ${e}`); }
    }
    if (OpenAIBackend) {
      try { this.registry.register(new OpenAIBackend()); log("Registered openai backend"); } catch (e) { log(`Failed to register openai: ${e}`); }
    }
    if (OllamaBackend) {
      try { this.registry.register(new OllamaBackend()); log("Registered ollama backend"); } catch (e) { log(`Failed to register ollama: ${e}`); }
    }
    if (AnthropicBackend) {
      try { this.registry.register(new AnthropicBackend()); log("Registered anthropic backend"); } catch (e) { log(`Failed to register anthropic: ${e}`); }
    }
    if (ClaudeCodeBackend) {
      try { this.registry.register(new ClaudeCodeBackend()); log("Registered claude-code backend"); } catch (e) { log(`Failed to register claude-code: ${e}`); }
    }

    // Start event dispatcher if available
    if (EventDispatcher) {
      try {
        this.eventDispatcherInstance = new EventDispatcher(this.world, this.registry);
        this.eventDispatcherInstance.start();
        log("Event dispatcher started");
      } catch (e) { log(`Failed to start event dispatcher: ${e}`); }
    }

    // Restore config
    const config = loadConfig();
    if (config) {
      this.world.loadFromConfig(config as unknown as import("./simulation/types.js").AppConfig);
      log(`Loaded config: ${this.world.state.agents.length} agents`);
      for (const a of this.world.state.agents) {
        log(`  Agent ${a.name} (${a.avatar}): pos=(${a.position.x.toFixed(0)},${a.position.y.toFixed(0)}), bounds=(${this.world.state.bounds.x},${this.world.state.bounds.y})`);
      }
    }
    if (this.world.state.agents.length === 0) {
      this.world.addAgent("copilot", "Copilot");
      log("Added default copilot agent");
    }

    // Start package file watcher
    const pkgDir = userPackagesDir();
    startPackageWatcher(pkgDir, () => {
      this.reloadAndNotifyPackages();
    });
    log("Extension ready");
  }

  // ── Public API for commands ───────────────────────────────────────────

  getWorld(): World {
    return this.world;
  }

  getView(): vscode.WebviewView | undefined {
    return this.view;
  }

  notifyWebview(msg: Record<string, unknown>): void {
    this.view?.webview.postMessage(msg);
  }

  popOutChat(agentId: string): void {
    // If panel already exists, reveal it
    const existing = this.popOutPanels.get(agentId);
    if (existing) {
      existing.reveal();
      return;
    }

    const agent = this.world.state.agents.find((a) => a.id === agentId);
    const agentName = agent?.name ?? agentId;

    const panel = vscode.window.createWebviewPanel(
      "agentTerrariumChat",
      `Chat: ${agentName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist"),
          vscode.Uri.joinPath(this.extensionUri, "media"),
        ],
      },
    );

    this.popOutPanels.set(agentId, panel);

    panel.onDidDispose(() => {
      this.popOutPanels.delete(agentId);
    });

    // Handle messages from the pop-out chat
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "sendMessage") {
        // Relay to main handleMessage
        this.handleMessage({ ...msg, agentId });
        // Push updated chat to the pop-out panel
        setTimeout(() => this.pushChatToPanel(agentId), 100);
      } else if (msg.type === "ready") {
        this.pushChatToPanel(agentId);
      }
    });

    panel.webview.html = this.getChatHtml(panel.webview, agentId, agentName);
  }

  private pushChatToPanel(agentId: string): void {
    const panel = this.popOutPanels.get(agentId);
    if (!panel) return;
    const messages = this.world.getChatMessages(agentId);
    panel.webview.postMessage({
      type: "chatUpdate",
      agentId,
      messages,
    });
  }

  private getChatHtml(webview: vscode.Webview, agentId: string, agentName: string): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Chat: ${agentName}</title>
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    #messages { flex: 1; overflow-y: auto; padding: 8px 0; }
    .msg { margin: 4px 0; padding: 6px 10px; border-radius: 8px; max-width: 80%; word-wrap: break-word; }
    .msg.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-left: auto; text-align: right; }
    .msg.agent { background: var(--vscode-input-background); }
    #chat-container { display: flex; flex-direction: column; height: 100vh; }
    #input-row { display: flex; gap: 4px; padding: 8px 0; }
    #input-row input { flex: 1; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; }
    #input-row button { padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    h3 { margin: 0 0 8px 0; }
  </style>
</head>
<body>
  <div id="chat-container">
    <h3>💬 ${agentName}</h3>
    <div id="messages"></div>
    <div id="input-row">
      <input id="chat-input" type="text" placeholder="Type a message…" />
      <button id="send-btn">Send</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const agentId = ${JSON.stringify(agentId)};
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    function renderMessages(messages) {
      messagesEl.innerHTML = messages.map(m =>
        '<div class="msg ' + (m.fromUser ? 'user' : 'agent') + '">' +
        m.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
      ).join('');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      vscode.postMessage({ type: 'sendMessage', agentId, text });
      inputEl.value = '';
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'chatUpdate') {
        renderMessages(msg.messages || []);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  async configureAgent(agentId: string): Promise<void> {
    const agent = this.world.state.agents.find((a) => a.id === agentId);
    if (!agent) return;

    const action = await vscode.window.showQuickPick(
      ["Rename agent", "Change backend", "Set working directory"],
      { placeHolder: `Configure ${agent.name}` },
    );
    if (!action) return;

    if (action === "Rename agent") {
      const newName = await vscode.window.showInputBox({
        prompt: "New agent name",
        value: agent.name,
      });
      if (newName && newName !== agent.name) {
        this.world.renameAgent(agentId, newName);
      }
    } else if (action === "Change backend") {
      const backends = ["echo", "copilot", "vscode-lm", "openai", "ollama", "anthropic", "claude-code"];
      const currentBackend = agent.backendConfig?.backendId ?? "echo";
      const pick = await vscode.window.showQuickPick(
        backends.map((b) => ({ label: b, picked: b === currentBackend })),
        { placeHolder: `Current backend: ${currentBackend}` },
      );
      if (pick) {
        this.world.setBackendConfig(agentId, {
          backendId: pick.label,
          model: agent.backendConfig?.model ?? null,
          awarenessModel: agent.backendConfig?.awarenessModel ?? null,
          systemPrompt: agent.backendConfig?.systemPrompt ?? null,
          customAgent: agent.backendConfig?.customAgent ?? null,
          awarenessLevel: agent.backendConfig?.awarenessLevel ?? 0,
          ttsEnabled: agent.backendConfig?.ttsEnabled ?? false,
          cwd: agent.backendConfig?.cwd ?? null,
        });
      }
    } else if (action === "Set working directory") {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select working directory",
        defaultUri: agent.backendConfig?.cwd
          ? vscode.Uri.file(agent.backendConfig.cwd)
          : undefined,
      });
      if (uris && uris.length > 0) {
        this.world.setBackendConfig(agentId, {
          backendId: agent.backendConfig?.backendId ?? "echo",
          model: agent.backendConfig?.model ?? null,
          awarenessModel: agent.backendConfig?.awarenessModel ?? null,
          systemPrompt: agent.backendConfig?.systemPrompt ?? null,
          customAgent: agent.backendConfig?.customAgent ?? null,
          awarenessLevel: agent.backendConfig?.awarenessLevel ?? 0,
          ttsEnabled: agent.backendConfig?.ttsEnabled ?? false,
          cwd: uris[0].fsPath,
        });
        log(`Set working directory for ${agent.name}: ${uris[0].fsPath}`);
      }
    }
  }

  private reloadAndNotifyPackages(): void {
    let packages: string[] = [];
    if (loadUserPackages) {
      try { packages = loadUserPackages(); } catch {}
    } else {
      const dir = userPackagesDir();
      try {
        if (fs.existsSync(dir)) {
          for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            if (entry.endsWith(".json") && fs.statSync(full).isFile()) {
              packages.push(fs.readFileSync(full, "utf-8"));
            }
          }
        }
      } catch {}
    }
    this.view?.webview.postMessage({
      type: "loadUserPackagesResult",
      packages,
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    log("Resolving webview view...");

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "media"),
        vscode.Uri.joinPath(this.extensionUri, "..", "public", "packages"),
        vscode.Uri.file(userPackagesDir()),
      ],
    };

    // Compute webview URI for the packages directory so the webview can load SVGs
    this.packagesBaseUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "..", "public", "packages"),
    ).toString();
    this.userPackagesBaseUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(userPackagesDir()),
    ).toString();
    log(`Packages base URI: ${this.packagesBaseUri}`);
    log(`User packages base URI: ${this.userPackagesBaseUri}`);

    webviewView.webview.html = this.getHtml(webviewView.webview);
    log("Webview HTML set");

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg) => {
      const msgType = msg?.type ?? msg?.command ?? "unknown";
      if (msgType !== "updateMouse" && msgType !== "resize") {
        log(`Webview message: ${msgType}`);
      }
      this.handleMessage(msg);
    });

    // Start simulation tick loop (20 Hz = 50ms)
    this.tickInterval = setInterval(() => {
      this.world.tick();
      this.checkAttentionNotifications();
      this.pushState();
    }, 50);
    log("Simulation tick loop started (20 Hz)");

    webviewView.onDidDispose(() => {
      log("Webview disposed");
      if (this.tickInterval) clearInterval(this.tickInterval);
    });
  }

  private checkAttentionNotifications(): void {
    for (const agent of this.world.state.agents) {
      if (agent.state === AgentState.NeedsAttention) {
        if (!this.notifiedAttentionAgents.has(agent.id)) {
          this.notifiedAttentionAgents.add(agent.id);
          vscode.window
            .showInformationMessage(
              `${agent.name} needs your attention!`,
              "Open Chat",
            )
            .then((choice: string | undefined) => {
              if (choice === "Open Chat") {
                this.view?.webview.postMessage({
                  type: "openAgentChat",
                  agentId: agent.id,
                });
                this.world.dismissAttention(agent.id);
                this.world.clickAgent(agent.id);
              }
            });
        }
      } else {
        // Agent no longer needs attention — allow future notifications
        this.notifiedAttentionAgents.delete(agent.id);
      }
    }
  }

  private pushState(): void {
    const state = this.world.getState();
    // Convert Map to plain object for JSON serialization across the webview boundary
    const pendingFiles: Record<string, [string, string][]> = {};
    if (state.pendingFiles instanceof Map) {
      for (const [k, v] of state.pendingFiles) {
        pendingFiles[k] = v;
      }
    }
    this.view?.webview.postMessage({
      type: "worldState",
      state: { ...state, pendingFiles },
    });
  }

  /** Push built-in package JSON files to the webview for the registry adapter. */
  private pushBuiltinPackages(): void {
    const packages: string[] = [];

    // Load built-in packages from public/packages/ (shipped with app)
    const publicDir = path.join(this.extensionUri.fsPath, "..", "public", "packages");
    log(`Loading built-in packages from: ${publicDir}`);
    try {
      if (fs.existsSync(publicDir)) {
        this.loadPackagesFromDir(publicDir, packages);
      }
    } catch (e) { log(`Error loading built-in packages: ${e}`); }

    // Load user packages from ~/agent-terrarium/packages/
    const userDir = userPackagesDir();
    log(`Loading user packages from: ${userDir}`);
    try {
      if (fs.existsSync(userDir)) {
        this.loadPackagesFromDir(userDir, packages);
      }
    } catch (e) { log(`Error loading user packages: ${e}`); }

    log(`Pushing ${packages.length} packages to webview`);
    this.view?.webview.postMessage({
      type: "packages",
      packages,
    });
  }

  private loadPackagesFromDir(dir: string, packages: string[]): void {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isFile() && entry.endsWith(".json")) {
        try { packages.push(fs.readFileSync(full, "utf-8")); } catch {}
      } else if (stat.isDirectory()) {
        // Recurse into subdirectories (e.g. seattle/, clippy/)
        for (const sub of fs.readdirSync(full)) {
          if (sub.endsWith(".json")) {
            try { packages.push(fs.readFileSync(path.join(full, sub), "utf-8")); } catch {}
          }
        }
      }
    }
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
        const requestId = msg.requestId as number | undefined;

        // Check for pending files — build context prefix for the backend (mirrors Rust lib.rs)
        const pending = this.world.getPendingFiles(agentId);
        let backendText: string;
        if (pending.length > 0) {
          const fileList = pending
            .map(([name, filePath]) => `- ${name}: ${filePath}`)
            .join("\n");
          this.world.clearPendingFiles(agentId);
          backendText = `[The user has shared the following file(s) with you:\n${fileList}\n]\n\n${text}`;
        } else {
          backendText = text;
        }

        // Add user message (display text only, without file context)
        const simBackendConfig = this.world.addUserMessage(agentId, text);

        const effectiveConfig: BackendConfig = simBackendConfig
          ? {
              backendId: simBackendConfig.backendId,
              model: simBackendConfig.model ?? undefined,
              awarenessModel: simBackendConfig.awarenessModel ?? undefined,
              systemPrompt: simBackendConfig.systemPrompt ?? undefined,
              customAgent: simBackendConfig.customAgent ?? undefined,
              awarenessLevel: simBackendConfig.awarenessLevel,
              ttsEnabled: simBackendConfig.ttsEnabled,
              cwd: simBackendConfig.cwd ?? undefined,
            }
          : {
              backendId: "echo",
              awarenessLevel: 0,
              ttsEnabled: false,
            };
        const backendId = effectiveConfig.backendId ?? "echo";
        const backend = this.registry.get(backendId) ?? this.registry.get("echo");
        let replyContent = "";
        if (backend) {
          // Lazily load credential from SecretStorage if backend needs one
          if (!(await backend.isAvailable())) {
            const credKey = backend.credentialKey();
            if (credKey) {
              const key = await this.secrets.get(credKey);
              if (key) {
                await backend.setApiKey(key);
              }
            }
          }

          const chatMsgs = this.world.getChatMessages(agentId);
          const backendMsgs: BackendMessage[] = chatMsgs.map((m) => ({
            role: m.fromUser ? "user" as const : "assistant" as const,
            content: m.text,
          }));
          // Replace the last user message content with backendText (includes file context)
          for (let i = backendMsgs.length - 1; i >= 0; i--) {
            if (backendMsgs[i].role === "user") {
              backendMsgs[i].content = backendText;
              break;
            }
          }

          try {
            const resp = await backend.respond(agentId, effectiveConfig, backendMsgs);
            this.world.completeResponse(agentId, resp.content);
            this.world.pushBubble(agentId, resp.content, false, 5);
            // Detach any claimed file now that the backend has responded
            this.world.detachFile(agentId);
            if (resp.needsAttention) {
              this.world.requestAttention(agentId);
            }
            replyContent = resp.content;
          } catch (err) {
            const errMsg =
              err instanceof Error ? err.message : "Unknown error";
            this.world.completeResponse(agentId, `Error: ${errMsg}`);
            replyContent = `Error: ${errMsg}`;
          }
        }
        // Send reply back to the webview for the promise resolution
        if (requestId !== undefined) {
          this.view?.webview.postMessage({
            type: "sendMessageResult",
            requestId,
            reply: replyContent,
          });
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

      case "setBackendConfig": {
        const cfg = msg.config as BackendConfig;
        this.world.setBackendConfig(
          msg.agentId as string,
          {
            backendId: cfg.backendId,
            model: cfg.model ?? null,
            awarenessModel: cfg.awarenessModel ?? null,
            systemPrompt: cfg.systemPrompt ?? null,
            customAgent: cfg.customAgent ?? null,
            awarenessLevel: cfg.awarenessLevel,
            ttsEnabled: cfg.ttsEnabled,
            cwd: cfg.cwd ?? null,
          },
        );
        break;
      }

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

      // ── File drop handlers ──────────────────────────────────────────
      case "dropFiles": {
        const fileId = this.world.dropFiles(
          msg.files as [string, string][],
          msg.x as number,
          msg.y as number,
        );
        this.view?.webview.postMessage({
          type: "dropFilesResult",
          fileId,
          requestId: msg.requestId,
        });
        break;
      }

      case "removeDroppedFile":
        this.world.removeDroppedFile(msg.fileId as string);
        break;

      case "detachAgentFile":
        this.world.detachFile(msg.agentId as string);
        break;

      case "setPendingFiles":
        this.world.setPendingFiles(
          msg.agentId as string,
          msg.files as [string, string][],
        );
        break;

      case "clearPendingFiles":
        this.world.clearPendingFiles(msg.agentId as string);
        break;

      // ── Credential management ───────────────────────────────────────
      case "setCredential":
        await this.secrets.store(
          msg.backendId as string,
          msg.key as string,
        );
        break;

      case "getCredential": {
        const value = await this.secrets.get(msg.backendId as string);
        this.view?.webview.postMessage({
          type: "getCredentialResult",
          backendId: msg.backendId,
          key: value ?? null,
        });
        break;
      }

      case "deleteCredential":
        await this.secrets.delete(msg.backendId as string);
        break;

      case "hasCredential": {
        const val = await this.secrets.get(msg.backendId as string);
        this.view?.webview.postMessage({
          type: "hasCredentialResult",
          backendId: msg.backendId,
          exists: val !== undefined,
        });
        break;
      }

      // ── Backend listing ─────────────────────────────────────────────
      case "listBackendModels": {
        const be = this.registry.get(msg.backendId as string);
        const models = be ? await be.listModels() : [];
        this.view?.webview.postMessage({
          type: "listBackendModelsResult",
          backendId: msg.backendId,
          models,
        });
        break;
      }

      case "listBackendAgents": {
        const be2 = this.registry.get(msg.backendId as string);
        const agents = be2
          ? await be2.listAgents(msg.cwd as string | undefined)
          : [];
        this.view?.webview.postMessage({
          type: "listBackendAgentsResult",
          backendId: msg.backendId,
          agents,
        });
        break;
      }

      // ── Utility handlers ────────────────────────────────────────────
      case "saveConfig": {
        const simAgentConfigs = this.world.getAgentConfigs();
        const state = this.world.getState();
        const configAgents: ConfigAgentConfig[] = simAgentConfigs.map((a) => ({
          id: a.id,
          name: a.name,
          avatar: a.avatar,
          gear: a.gear,
          backendConfig: {
            backendId: a.backendConfig.backendId,
            model: a.backendConfig.model ?? undefined,
            awarenessModel: a.backendConfig.awarenessModel ?? undefined,
            systemPrompt: a.backendConfig.systemPrompt ?? undefined,
            customAgent: a.backendConfig.customAgent ?? undefined,
            awarenessLevel: a.backendConfig.awarenessLevel,
            ttsEnabled: a.backendConfig.ttsEnabled,
            cwd: a.backendConfig.cwd ?? undefined,
          },
        }));
        const appConfig: AppConfig = {
          theme: (msg.theme as string) ?? "default",
          agents: configAgents,
          ballMaxCaptures: state.ballMaxCaptures,
          ballKickOnCapture: state.ballKickOnCapture,
          attentionIntervalSecs: state.attentionIntervalSecs,
          musicMuted: (msg.musicMuted as boolean) ?? false,
          dynamicSky: (msg.dynamicSky as boolean) ?? false,
        };
        saveConfig(appConfig);
        break;
      }

      case "loadConfig": {
        const loaded = loadConfig();
        this.view?.webview.postMessage({
          type: "loadConfigResult",
          config: loaded,
        });
        break;
      }

      case "loadUserPackages": {
        let packages: string[] = [];
        if (loadUserPackages) {
          try { packages = loadUserPackages(); } catch {}
        } else {
          // Inline fallback: read JSON files from user packages dir
          const dir = userPackagesDir();
          try {
            if (fs.existsSync(dir)) {
              for (const entry of fs.readdirSync(dir)) {
                const full = `${dir}/${entry}`;
                if (entry.endsWith(".json") && fs.statSync(full).isFile()) {
                  packages.push(fs.readFileSync(full, "utf-8"));
                }
              }
            }
          } catch {}
        }
        this.view?.webview.postMessage({
          type: "loadUserPackagesResult",
          packages,
        });
        break;
      }

      case "fetchLocation": {
        if (fetchLocation) {
          try {
            const loc = await fetchLocation();
            this.view?.webview.postMessage({ type: "fetchLocationResult", location: loc });
          } catch (err) {
            this.view?.webview.postMessage({ type: "fetchLocationResult", error: String(err) });
          }
        } else {
          this.view?.webview.postMessage({ type: "fetchLocationResult", error: "Not available" });
        }
        break;
      }

      case "fetchWeather": {
        if (fetchWeather) {
          try {
            const data = await fetchWeather(msg.lat as number, msg.lon as number);
            this.view?.webview.postMessage({ type: "fetchWeatherResult", weather: data });
          } catch (err) {
            this.view?.webview.postMessage({ type: "fetchWeatherResult", error: String(err) });
          }
        } else {
          this.view?.webview.postMessage({ type: "fetchWeatherResult", error: "Not available" });
        }
        break;
      }

      case "ready":
        // Send base URIs for loading SVG assets
        this.view?.webview.postMessage({
          type: "assetBaseUris",
          packagesBaseUri: this.packagesBaseUri,
          userPackagesBaseUri: this.userPackagesBaseUri,
        });
        this.pushState();
        this.pushBuiltinPackages();
        break;

      case "updateMouse":
        this.world.updateMouse(
          msg.x as number | null,
          msg.y as number | null,
        );
        break;

      // ── About dialog ────────────────────────────────────────────────
      case "showAbout":
        vscode.window.showInformationMessage(
          "Agent Terrarium v0.1.0\n\nAI agents in an animated world in your editor.\n\nhttps://github.com/nicefiction/agent-terrarium",
          "OK",
        );
        break;

      // ── Debug panel (show Output channel) ───────────────────────────
      case "toggleDebug":
        outputChannel.show(true);
        break;

      // ── File drop via picker ────────────────────────────────────────
      case "openFilePicker": {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: "Drop into Terrarium",
        });
        if (uris && uris.length > 0) {
          const files: [string, string][] = uris.map((u) => [
            path.basename(u.fsPath),
            u.fsPath,
          ]);
          const bounds = this.world.getState().bounds;
          const x = bounds.x / 2;
          const y = bounds.y * 0.8;
          const fileId = this.world.dropFiles(files, x, y);
          this.view?.webview.postMessage({ type: "dropFilesResult", fileId });
        }
        break;
      }

      // ── Pop-out chat ────────────────────────────────────────────────
      case "popOutChat":
        this.popOutChat(msg.agentId as string);
        break;

      // ── Configure agent (VS Code native UI) ─────────────────────────
      case "configureAgent":
        this.configureAgent(msg.agentId as string);
        break;

      // ── Get file icon data URL ──────────────────────────────────────
      case "getFileIcon": {
        const dataUrl = getFileIconDataUrl(msg.filename as string);
        this.view?.webview.postMessage({
          type: "getFileIconResult",
          filename: msg.filename,
          dataUrl,
        });
        break;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <meta http-equiv="Content-Security-Policy"\n    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: https:; connect-src ${webview.cspSource} https:; font-src ${webview.cspSource};" />\n  <title>Agent Terrarium</title>\n  <link rel="stylesheet" href="${cssUri}" />\n  <style>\n    body { margin: 0; padding: 0; overflow: hidden; }\n    #root { width: 100%; height: 100vh; }\n    #loading { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }\n  </style>\n</head>\n<body>\n  <div id="root"><div id="loading">🏡 Loading Agent Terrarium...</div></div>\n  <script nonce="${nonce}">\n    console.log('[AT] Inline script running');\n    window.__PACKAGES_BASE_URI__ = ${JSON.stringify(this.packagesBaseUri)};\n    window.__USER_PACKAGES_BASE_URI__ = ${JSON.stringify(this.userPackagesBaseUri)};\n    console.log('[AT] Base URIs:', window.__PACKAGES_BASE_URI__, window.__USER_PACKAGES_BASE_URI__);\n    window.onerror = function(msg, src, line, col, err) {\n      console.error('[AT] Error:', msg, src, line, col, err);\n      document.getElementById('root').innerHTML = '<pre style="color:red;padding:10px;font-size:11px;white-space:pre-wrap;">Error: ' + msg + '\\n' + (err && err.stack || '') + '</pre>';\n    };\n  </script>\n  <script nonce="${nonce}" src="${scriptUri}"></script>\n</body>\n</html>`;
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
    this.eventDispatcherInstance?.stop();
    stopPackageWatcher();
    for (const panel of this.popOutPanels.values()) {
      panel.dispose();
    }
    this.popOutPanels.clear();
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
  outputChannel = vscode.window.createOutputChannel("Agent Terrarium");
  context.subscriptions.push(outputChannel);
  log("Extension activating...");

  provider = new TerrariumViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TerrariumViewProvider.viewType,
      provider,
    ),
  );

  // ── Commands ────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("agent-terrarium.toggle", () => {
      vscode.commands.executeCommand("agentTerrariumView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agent-terrarium.addAgent", async () => {
      if (!provider) return;
      const avatars = [
        { label: "🐱 Cat", value: "cat" },
        { label: "✨ Copilot", value: "copilot" },
        { label: "🐿️ Squirrel", value: "squirrel" },
        { label: "🐧 Penguin", value: "penguin" },
        { label: "👻 Ghost", value: "ghost" },
        { label: "📎 Clippy", value: "clippy" },
        { label: "😊 Default", value: "default" },
      ];
      const picked = await vscode.window.showQuickPick(
        avatars.map((a) => ({ label: a.label, description: a.value })),
        { placeHolder: "Choose an avatar for the new agent" },
      );
      if (!picked) return;
      const avatar = picked.description!;
      const name = await vscode.window.showInputBox({
        prompt: "Name your new agent",
        value: avatar.charAt(0).toUpperCase() + avatar.slice(1),
      });
      if (!name) return;
      provider.getWorld().addAgent(avatar, name);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agent-terrarium.changeTheme", async () => {
      if (!provider) return;
      const themes = [
        { label: "🌿 Default", value: "default" },
        { label: "🌙 Night", value: "night" },
        { label: "🏖️ Beach", value: "beach" },
        { label: "🌌 Space", value: "space" },
        { label: "🍂 Autumn", value: "autumn" },
        { label: "❄️ Winter", value: "winter" },
        { label: "🌸 Cherry Blossom", value: "cherry_blossom" },
      ];
      const picked = await vscode.window.showQuickPick(
        themes.map((t) => ({ label: t.label, description: t.value })),
        { placeHolder: "Choose a theme" },
      );
      if (!picked) return;
      provider.notifyWebview({ type: "themeChanged", theme: picked.description });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agent-terrarium.throwBall", () => {
      if (!provider) return;
      const world = provider.getWorld();
      const bounds = world.getState().bounds;
      const x = bounds.x / 2;
      const y = bounds.y * 0.3;
      const vx = (Math.random() - 0.5) * 200;
      const vy = Math.random() * 100 + 50;
      world.throwBall(x, y, vx, vy);
    }),
  );
}

export function deactivate(): void {
  provider?.stop();
}
