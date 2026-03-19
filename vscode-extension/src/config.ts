import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_FILENAME = "agent-terrarium.json";
const APP_DIR = "agent-terrarium";

export interface AgentConfig {
  id: string;
  avatar: string;
  name: string;
  gear: string[];
  backendConfig?: {
    backendId: string;
    model?: string;
    awarenessModel?: string;
    systemPrompt?: string;
    customAgent?: string;
    awarenessLevel: number;
    ttsEnabled: boolean;
    cwd?: string;
  };
}

export interface AppConfig {
  theme: string;
  agents: AgentConfig[];
  window?: { x: number; y: number; width: number; height: number };
  ballMaxCaptures: number;
  ballKickOnCapture: boolean;
  attentionIntervalSecs: number;
  musicMuted: boolean;
  dynamicSky: boolean;
}

function configPath(): string {
  return path.join(os.homedir(), CONFIG_FILENAME);
}

function appDir(): string {
  return path.join(os.homedir(), APP_DIR);
}

export function chatHistoryDir(): string {
  return path.join(appDir(), "chat");
}

export function userPackagesDir(): string {
  return path.join(appDir(), "packages");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig | null {
  const p = configPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as AppConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

function chatFilePath(agentId: string): string {
  return path.join(chatHistoryDir(), `${agentId}.json`);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function loadChatHistory(agentId: string): ChatMessage[] {
  const p = chatFilePath(agentId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveChatHistory(
  agentId: string,
  messages: ChatMessage[],
): void {
  ensureDir(chatHistoryDir());
  fs.writeFileSync(chatFilePath(agentId), JSON.stringify(messages), "utf-8");
}
