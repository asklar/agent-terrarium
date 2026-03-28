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
  personality?: {
    speedMin: number;
    speedMax: number;
    movementStyle: string;
    interactionChance: number;
    ballInterest: number;
    chatEmojis: string[];
  };
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
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    // Config file uses snake_case (Rust serde); convert to camelCase
    return {
      theme: raw.theme ?? "meadow",
      agents: (raw.agents ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        gear: a.gear ?? [],
        personality: a.personality ? {
          speedMin: (a.personality as Record<string, unknown>).speed_min,
          speedMax: (a.personality as Record<string, unknown>).speed_max,
          movementStyle: (a.personality as Record<string, unknown>).movement_style,
          interactionChance: (a.personality as Record<string, unknown>).interaction_chance,
          ballInterest: (a.personality as Record<string, unknown>).ball_interest,
          chatEmojis: (a.personality as Record<string, unknown>).chat_emojis,
        } : undefined,
        backendConfig: a.backend_config ? {
          backendId: (a.backend_config as Record<string, unknown>).backend_id ?? "echo",
          model: (a.backend_config as Record<string, unknown>).model,
          awarenessModel: (a.backend_config as Record<string, unknown>).awareness_model,
          systemPrompt: (a.backend_config as Record<string, unknown>).system_prompt,
          customAgent: (a.backend_config as Record<string, unknown>).custom_agent,
          awarenessLevel: (a.backend_config as Record<string, unknown>).awareness_level ?? 0,
          ttsEnabled: (a.backend_config as Record<string, unknown>).tts_enabled ?? false,
          cwd: (a.backend_config as Record<string, unknown>).cwd,
        } : undefined,
      })),
      window: raw.window,
      ballMaxCaptures: raw.ball_max_captures ?? 3,
      ballKickOnCapture: raw.ball_kick_on_capture ?? true,
      attentionIntervalSecs: raw.attention_interval_secs ?? 5,
      musicMuted: raw.music_muted ?? false,
      dynamicSky: raw.dynamic_sky ?? false,
    };
  } catch {
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  // Convert to snake_case for compatibility with the Tauri app's serde format
  const raw = {
    theme: config.theme,
    agents: config.agents.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      gear: a.gear,
      personality: a.personality ? {
        speed_min: a.personality.speedMin,
        speed_max: a.personality.speedMax,
        movement_style: a.personality.movementStyle,
        interaction_chance: a.personality.interactionChance,
        ball_interest: a.personality.ballInterest,
        chat_emojis: a.personality.chatEmojis,
      } : undefined,
      backend_config: a.backendConfig ? {
        backend_id: a.backendConfig.backendId,
        model: a.backendConfig.model,
        awareness_model: a.backendConfig.awarenessModel,
        system_prompt: a.backendConfig.systemPrompt,
        custom_agent: a.backendConfig.customAgent,
        awareness_level: a.backendConfig.awarenessLevel,
        tts_enabled: a.backendConfig.ttsEnabled,
        cwd: a.backendConfig.cwd,
      } : undefined,
    })),
    window: config.window,
    ball_max_captures: config.ballMaxCaptures,
    ball_kick_on_capture: config.ballKickOnCapture,
    attention_interval_secs: config.attentionIntervalSecs,
    music_muted: config.musicMuted,
    dynamic_sky: config.dynamicSky,
  };
  fs.writeFileSync(configPath(), JSON.stringify(raw, null, 2), "utf-8");
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
