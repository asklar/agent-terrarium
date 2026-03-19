export type MessageRole = "system" | "user" | "assistant";

export interface BackendMessage {
  role: MessageRole;
  content: string;
}

export interface BackendConfig {
  backendId: string;
  model?: string;
  awarenessModel?: string;
  systemPrompt?: string;
  customAgent?: string;
  awarenessLevel: number;
  ttsEnabled: boolean;
  cwd?: string;
}

export interface BackendResponse {
  content: string;
  needsAttention: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface AgentOption {
  id: string;
  name: string;
  description?: string;
}

export interface AgentBackend {
  id(): string;
  displayName(): string;
  respond(
    agentId: string,
    config: BackendConfig,
    messages: BackendMessage[],
  ): Promise<BackendResponse>;
  destroyChatSession(agentId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
  listModels(): Promise<ModelOption[]>;
  listAgents(cwd?: string): Promise<AgentOption[]>;
  setApiKey(key: string): Promise<void>;
  credentialKey(): string | undefined;
}
