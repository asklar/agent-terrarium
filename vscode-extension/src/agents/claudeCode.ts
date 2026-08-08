import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

const execFileAsync = promisify(execFile);

export class ClaudeCodeBackend implements AgentBackend {
  id(): string {
    return "claude-code";
  }

  displayName(): string {
    return "Claude Code";
  }

  async respond(
    _agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      return { content: "No user message provided.", needsAttention: false };
    }

    let prompt = "";
    const prior = messages.slice(0, -1);
    if (prior.length > 0) {
      prompt += prior
        .map((m) => `[${m.role}]: ${m.content}`)
        .join("\n");
      prompt += "\n\n";
    }
    prompt += lastUserMsg.content;

    const args = ["--print", "--output-format", "json"];

    if (config.model) {
      args.push("--model", config.model);
    }

    if (config.systemPrompt) {
      args.push("--system-prompt", config.systemPrompt);
    }

    args.push(prompt);

    const options: { timeout: number; cwd?: string } = {
      timeout: 120_000,
    };
    if (config.cwd) {
      options.cwd = config.cwd;
    }

    try {
      const { stdout } = await execFileAsync("claude", args, options);
      return { content: parseResponse(stdout), needsAttention: false };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Claude Code process failed";
      throw new Error(`Claude Code error: ${msg}`);
    }
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("claude", ["--version"], { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelOption[]> {
    return [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-haiku-4-20250414", name: "Claude Haiku 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    ];
  }

  async listAgents(_cwd?: string): Promise<AgentOption[]> {
    return [];
  }

  async setApiKey(_key: string): Promise<void> {}

  credentialKey(): string | undefined {
    return undefined;
  }
}

function parseResponse(stdout: string): string {
  try {
    const json = JSON.parse(stdout);
    if (typeof json.result === "string") {
      return json.result;
    }
  } catch {
    // fall through
  }
  return stdout.trim() || "No response from Claude Code.";
}
