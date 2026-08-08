import type {
  AgentBackend,
  BackendConfig,
  BackendMessage,
  BackendResponse,
  ModelOption,
  AgentOption,
} from "./backend.js";

interface ChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

interface ChatResponse {
  choices: { message: { content?: string } }[];
}

interface ModelsResponse {
  data: { id: string }[];
}

export class OpenAIBackend implements AgentBackend {
  private endpoint: string;
  private defaultModel: string;
  private apiKey: string | undefined;
  private _credentialKey: string;

  constructor(
    endpoint = "https://api.openai.com/v1",
    defaultModel = "gpt-4o",
    credentialKey = "openai",
  ) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.defaultModel = defaultModel;
    this._credentialKey = credentialKey;
  }

  id(): string {
    return "openai";
  }

  displayName(): string {
    return "OpenAI";
  }

  async respond(
    _agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
    if (!this.apiKey) {
      throw new Error(
        "No API key configured for OpenAI. Set one via the context menu.",
      );
    }

    const model = config.model ?? this.defaultModel;

    const chatMessages: { role: string; content: string }[] = [];

    if (config.systemPrompt) {
      chatMessages.push({ role: "system", content: config.systemPrompt });
    }

    for (const msg of messages) {
      chatMessages.push({ role: msg.role, content: msg.content });
    }

    const request: ChatRequest = {
      model,
      messages: chatMessages,
      max_tokens: 1024,
      temperature: 0.7,
    };

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`API error ${response.status}: ${body}`);
    }

    const chatResponse = (await response.json()) as ChatResponse;
    const content =
      chatResponse.choices?.[0]?.message?.content ??
      "No response generated.";

    return { content, needsAttention: false };
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey !== undefined;
  }

  async listModels(): Promise<ModelOption[]> {
    if (!this.apiKey) {
      return [];
    }
    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as ModelsResponse;
      return (data.data ?? []).map((m) => ({ id: m.id, name: m.id }));
    } catch {
      return [];
    }
  }

  async listAgents(_cwd?: string): Promise<AgentOption[]> {
    return [];
  }

  async setApiKey(key: string): Promise<void> {
    this.apiKey = key;
  }

  credentialKey(): string | undefined {
    return this._credentialKey;
  }
}
