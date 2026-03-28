import * as vscode from "vscode";
import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

export class VsCodeLmBackend implements AgentBackend {
  id(): string {
    return "vscode-lm";
  }

  displayName(): string {
    return "VS Code Language Models";
  }

  async respond(
    _agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    const models = await vscode.lm.selectChatModels(
      config.model ? { family: config.model } : undefined,
    );
    if (models.length === 0) {
      throw new Error(
        "No Copilot language models available. Make sure GitHub Copilot is installed and signed in.",
      );
    }
    const model = models[0];

    const lmMessages: vscode.LanguageModelChatMessage[] = [];

    if (config.systemPrompt) {
      lmMessages.push(
        vscode.LanguageModelChatMessage.User(
          `[System] ${config.systemPrompt}`,
        ),
      );
    }

    for (const msg of messages) {
      switch (msg.role) {
        case "system":
          lmMessages.push(
            vscode.LanguageModelChatMessage.User(`[System] ${msg.content}`),
          );
          break;
        case "user":
          lmMessages.push(
            vscode.LanguageModelChatMessage.User(msg.content),
          );
          break;
        case "assistant":
          lmMessages.push(
            vscode.LanguageModelChatMessage.Assistant(msg.content),
          );
          break;
      }
    }

    const response = await model.sendRequest(lmMessages);

    let content = "";
    for await (const chunk of response.text) {
      content += chunk;
    }

    return { content: content || "...", needsAttention: false };
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelOption[]> {
    try {
      const models = await vscode.lm.selectChatModels();
      return models.map((m) => ({ id: m.family, name: m.name }));
    } catch {
      return [];
    }
  }

  async listAgents(cwd?: string): Promise<AgentOption[]> {
    const agents: AgentOption[] = [];
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";

    // Scan ~/.copilot/agents/*.md (user-level)
    if (homeDir) {
      await scanAgentDir(
        vscode.Uri.file(`${homeDir}/.copilot/agents`),
        "user",
        agents,
      );
    }

    // Scan <cwd>/.github/agents/*.md (repo-level)
    if (cwd) {
      await scanAgentDir(
        vscode.Uri.file(`${cwd}/.github/agents`),
        "repo",
        agents,
      );
    }

    return agents;
  }

  async setApiKey(_key: string): Promise<void> {
    // Copilot auth is handled by the VS Code extension, no manual key needed
  }

  credentialKey(): string | undefined {
    return undefined;
  }
}

async function scanAgentDir(
  dirUri: vscode.Uri,
  source: string,
  agents: AgentOption[],
): Promise<void> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith(".md")) {
        const stem = name.slice(0, -3);
        if (!agents.some((a) => a.name === stem)) {
          agents.push({ name: stem, source });
        }
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
}
