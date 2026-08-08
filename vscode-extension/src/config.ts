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
    // Config file may use snake_case (Rust serde) or camelCase (VS Code);
    // handle both by checking for either key variant
    return {
      theme: raw.theme ?? "meadow",
      agents: (raw.agents ?? []).map((a: Record<string, unknown>) => {
        const pers = (a.personality ?? {}) as Record<string, unknown>;
        const bc = (a.backend_config ?? a.backendConfig ?? {}) as Record<string, unknown>;
        return {
          id: a.id,
          name: a.name,
          avatar: a.avatar,
          gear: a.gear ?? [],
          personality: pers.speedMin !== undefined || pers.speed_min !== undefined ? {
            speedMin: pers.speedMin ?? pers.speed_min,
            speedMax: pers.speedMax ?? pers.speed_max,
            movementStyle: pers.movementStyle ?? pers.movement_style,
            interactionChance: pers.interactionChance ?? pers.interaction_chance,
            ballInterest: pers.ballInterest ?? pers.ball_interest,
            chatEmojis: pers.chatEmojis ?? pers.chat_emojis,
          } : undefined,
          backendConfig: Object.keys(bc).length > 0 ? {
            backendId: bc.backendId ?? bc.backend_id ?? "echo",
            model: bc.model,
            awarenessModel: bc.awarenessModel ?? bc.awareness_model,
            systemPrompt: bc.systemPrompt ?? bc.system_prompt,
            customAgent: bc.customAgent ?? bc.custom_agent,
            awarenessLevel: bc.awarenessLevel ?? bc.awareness_level ?? 0,
            ttsEnabled: bc.ttsEnabled ?? bc.tts_enabled ?? false,
            cwd: bc.cwd,
          } : undefined,
        };
      }),
      window: raw.window,
      ballMaxCaptures: raw.ballMaxCaptures ?? raw.ball_max_captures ?? 3,
      ballKickOnCapture: raw.ballKickOnCapture ?? raw.ball_kick_on_capture ?? true,
      attentionIntervalSecs: raw.attentionIntervalSecs ?? raw.attention_interval_secs ?? 5,
      musicMuted: raw.musicMuted ?? raw.music_muted ?? false,
      dynamicSky: raw.dynamicSky ?? raw.dynamic_sky ?? false,
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
