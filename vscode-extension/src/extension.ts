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

// Optional imports for modules that may still be in progress
let CopilotBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let OpenAIBackend: (new () => import("./agents/backend.js").AgentBackend) | undefined;
let EventDispatcher: (new (world: World, registry: BackendRegistry) => { start(): void; stop(): void }) | undefined;

try { CopilotBackend = require("./agents/copilot.js").CopilotBackend; } catch {}
try { OpenAIBackend = require("./agents/openai.js").OpenAIBackend; } catch {}
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
import { Vec2 } from "./simulation/types.js";
import * as fs from "node:fs";

// ── Webview provider ────────────────────────────────────────────────

class TerrariumViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "agentTerrariumView";

  private view?: vscode.WebviewView;
  private tickInterval?: ReturnType<typeof setInterval>;
  private world: World;
  private registry: BackendRegistry;
  private secrets: vscode.SecretStorage;
  private eventDispatcherInstance?: { start(): void; stop(): void };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.secrets = context.secrets;
    this.world = new World(Vec2.new(300, 200));
    this.registry = new BackendRegistry();
    this.registry.register(new EchoBackend());

    // Register optional backends
    if (CopilotBackend) {
      try { this.registry.register(new CopilotBackend()); } catch {}
    }
    if (OpenAIBackend) {
      try { this.registry.register(new OpenAIBackend()); } catch {}
    }

    // Start event dispatcher if available
    if (EventDispatcher) {
      try {
        this.eventDispatcherInstance = new EventDispatcher(this.world, this.registry);
        this.eventDispatcherInstance.start();
      } catch {}
    }

    // Restore config
    const config = loadConfig();
    if (config) {
      this.world.loadFromConfig(config as unknown as import("./simulation/types.js").AppConfig);
    }
    if (this.world.state.agents.length === 0) {
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
      this.world.tick();
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
        this.view?.webview.postMessage({ type: "dropFilesResult", fileId });
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
    this.eventDispatcherInstance?.stop();
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
  provider = new TerrariumViewProvider(context.extensionUri, context);

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
