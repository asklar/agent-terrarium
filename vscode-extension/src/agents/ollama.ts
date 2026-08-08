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

interface OllamaTagsResponse {
  models: { name: string }[];
}

export class OllamaBackend implements AgentBackend {
  private endpoint: string;
  private defaultModel: string;

  constructor(
    endpoint = "http://localhost:11434",
    defaultModel = "llama3.2",
  ) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.defaultModel = defaultModel;
  }

  id(): string {
    return "ollama";
  }

  displayName(): string {
    return "Ollama";
  }

  async respond(
    _agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse> {
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

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama API error ${response.status}: ${body}`);
    }

    const chatResponse = (await response.json()) as ChatResponse;
    const content =
      chatResponse.choices?.[0]?.message?.content ??
      "No response generated.";

    return { content, needsAttention: false };
  }

  async destroyChatSession(_agentId: string): Promise<void> {}

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(this.endpoint, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelOption[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as OllamaTagsResponse;
      return (data.models ?? []).map((m) => ({ id: m.name, name: m.name }));
    } catch {
      return [];
    }
  }

  async listAgents(_cwd?: string): Promise<AgentOption[]> {
    return [];
  }

  async setApiKey(_key: string): Promise<void> {}

  credentialKey(): string | undefined {
    return undefined;
  }
}
