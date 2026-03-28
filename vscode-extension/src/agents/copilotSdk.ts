// @github/copilot-sdk is ESM-only. Since this extension is bundled with esbuild,
// we define minimal SDK interfaces here and load the SDK at runtime via dynamic
// import() to avoid TS CJS/ESM resolution errors.
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

// Subset of @github/copilot-sdk types used by this backend
interface SdkCopilotClient {
  start(): Promise<void>;
  stop(): Promise<Error[]>;
  createSession(config: SdkSessionConfig): Promise<SdkCopilotSession>;
  listModels(): Promise<Array<{ id: string; name: string }>>;
  getAuthStatus(): Promise<{ isAuthenticated: boolean }>;
}

interface SdkCopilotSession {
  sessionId: string;
  sendAndWait(
    options: { prompt: string },
    timeout?: number,
  ): Promise<{ data: { content: string } } | undefined>;
  disconnect(): Promise<void>;
}

interface SdkSessionConfig {
  onPermissionRequest: SdkPermissionHandler;
  model?: string;
  systemMessage?: { mode: "append"; content: string };
  agent?: string;
  workingDirectory?: string;
}

type SdkPermissionHandler = (
  request: unknown,
  invocation: { sessionId: string },
) => unknown;

interface SdkModule {
  CopilotClient: new () => SdkCopilotClient;
  approveAll: SdkPermissionHandler;
}

let sdkModule: SdkModule | undefined;
async function loadSdk(): Promise<SdkModule> {
  if (!sdkModule) {
    // Dynamic import — esbuild resolves this at bundle time
    sdkModule = (await import("@github/copilot-sdk")) as unknown as SdkModule;
  }
  return sdkModule;
}

interface SessionEntry {
  session: SdkCopilotSession;
  userMessageCount: number;
  configKey: string;
}

function makeConfigKey(config: BackendConfig): string {
  return JSON.stringify({
    model: config.model,
    systemPrompt: config.systemPrompt,
    customAgent: config.customAgent,
    cwd: config.cwd,
  });
}

/**
 * AgentBackend powered by the @github/copilot-sdk package.
 * Communicates with Copilot CLI via JSON-RPC for session management,
 * model selection, and tool calling.
 */
export class CopilotSdkBackend implements AgentBackend {
  private client: SdkCopilotClient | undefined;
  private sessions = new Map<string, SessionEntry>();

  id(): string {
    return "copilot";
  }

  displayName(): string {
    return "GitHub Copilot";
  }

  private async ensureClient(): Promise<SdkCopilotClient> {
    if (!this.client) {
      const { CopilotClient } = await loadSdk();
      this.client = new CopilotClient();
      await this.client.start();
    }
    return this.client;
  }

  async respond(
    agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    const client = await this.ensureClient();

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      return { content: "No user message found.", needsAttention: false };
    }

    const currentConfigKey = makeConfigKey(config);
    let entry = this.sessions.get(agentId);

    // Recreate session if config changed or conversation was reset
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    if (
      entry &&
      (entry.configKey !== currentConfigKey ||
        userMessageCount < entry.userMessageCount)
    ) {
      try {
        await entry.session.disconnect();
      } catch {
        // ignore cleanup errors
      }
      this.sessions.delete(agentId);
      entry = undefined;
    }

    if (!entry) {
      const { approveAll } = await loadSdk();
      const session = await client.createSession({
        onPermissionRequest: approveAll,
        model: config.model,
        systemMessage: config.systemPrompt
          ? { mode: "append", content: config.systemPrompt }
          : undefined,
        agent: config.customAgent,
        workingDirectory: config.cwd,
      });

      entry = {
        session,
        userMessageCount: 0,
        configKey: currentConfigKey,
      };
      this.sessions.set(agentId, entry);
    }

    const response = await entry.session.sendAndWait(
      { prompt: lastUserMsg.content },
      300_000,
    );

    entry.userMessageCount = userMessageCount;

    const content = response?.data?.content ?? "No response generated.";
    return { content, needsAttention: false };
  }

  async destroyChatSession(agentId: string): Promise<void> {
    const entry = this.sessions.get(agentId);
    if (entry) {
      try {
        await entry.session.disconnect();
      } catch {
        // ignore cleanup errors
      }
      this.sessions.delete(agentId);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      const status = await client.getAuthStatus();
      return status.isAuthenticated;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelOption[]> {
    try {
      const client = await this.ensureClient();
      const models = await client.listModels();
      return models.map((m) => ({ id: m.id, name: m.name }));
    } catch {
      return [];
    }
  }

  async listAgents(cwd?: string): Promise<AgentOption[]> {
    const agents: AgentOption[] = [];
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";

    if (homeDir) {
      await scanAgentDir(
        path.join(homeDir, ".copilot", "agents"),
        "user",
        agents,
      );
    }

    if (cwd) {
      await scanAgentDir(
        path.join(cwd, ".github", "agents"),
        "repo",
        agents,
      );
    }

    return agents;
  }

  async setApiKey(_key: string): Promise<void> {
    // SDK handles auth via the Copilot CLI
  }

  credentialKey(): string | undefined {
    return undefined;
  }
}

async function scanAgentDir(
  dirPath: string,
  source: string,
  agents: AgentOption[],
): Promise<void> {
  try {
    const entries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const stem = entry.name.slice(0, -3);
        if (!agents.some((a) => a.name === stem)) {
          agents.push({ name: stem, source });
        }
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
}
