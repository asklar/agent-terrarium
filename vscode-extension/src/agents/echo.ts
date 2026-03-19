import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

export class EchoBackend implements AgentBackend {
  id(): string {
    return "echo";
  }

  displayName(): string {
    return "Echo (NPC)";
  }

  async respond(
    _agentId: string,
    _config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const echo = lastUserMsg ? lastUserMsg.content : "...";
    return { content: `Echo: ${echo}`, needsAttention: false };
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ModelOption[]> {
    return [];
  }

  async listAgents(_cwd?: string): Promise<AgentOption[]> {
    return [];
  }

  async setApiKey(_key: string): Promise<void> {}

  credentialKey(): string | undefined {
    return undefined;
  }
}
