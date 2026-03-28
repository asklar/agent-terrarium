import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: string; content: string }[];
}

interface AnthropicResponse {
  content: { type: string; text: string }[];
  stop_reason: string;
}

export class AnthropicBackend implements AgentBackend {
  private apiKey: string | undefined;

  id(): string {
    return "anthropic";
  }

  displayName(): string {
    return "Anthropic Claude";
  }

  async respond(
    _agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    if (!this.apiKey) {
      throw new Error(
        "No API key configured for Anthropic. Set one via the context menu.",
      );
    }

    const model = config.model ?? "claude-sonnet-4-20250514";

    const chatMessages: { role: string; content: string }[] = [];
    for (const msg of messages) {
      if (msg.role !== "system") {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const request: AnthropicRequest = {
      model,
      max_tokens: 1024,
      messages: chatMessages,
    };

    if (config.systemPrompt) {
      request.system = config.systemPrompt;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`API error ${response.status}: ${body}`);
    }

    const anthropicResponse = (await response.json()) as AnthropicResponse;
    const content =
      anthropicResponse.content?.[0]?.text ?? "No response generated.";

    return { content, needsAttention: false };
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey !== undefined;
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

  async setApiKey(key: string): Promise<void> {
    this.apiKey = key;
  }

  credentialKey(): string | undefined {
    return "anthropic";
  }
}
