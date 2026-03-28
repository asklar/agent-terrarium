/**
 * IPC Adapter for VS Code webview.
 *
 * Provides the same API shape as src/hooks/useWorldState.ts but uses
 * VS Code postMessage instead of Tauri invoke. The extension host pushes
 * worldState every tick; this hook stores it and exposes action callbacks.
 *
 * The extension host simulation uses camelCase field names while the
 * shared frontend components expect snake_case (matching Rust serde).
 * This adapter transparently converts between the two.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  WorldState,
  Agent,
  Ball,
  DroppedFile,
  ChatBubble,
  ChatSession,
  ChatMessage,
} from "../../src/types/world";

// acquireVsCodeApi is injected globally by the VS Code webview host.
// It can only be called ONCE, so we cache it at module scope.
declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = acquireVsCodeApi();

function getVsCodeApi() {
  return vscodeApi;
}

export { vscodeApi };

// ── camelCase → snake_case conversion ────────────────────────────────

function convertPersonality(p: Record<string, unknown>) {
  return {
    speed_min: (p.speedMin ?? p.speed_min ?? 0) as number,
    speed_max: (p.speedMax ?? p.speed_max ?? 0) as number,
    movement_style: (p.movementStyle ?? p.movement_style ?? "wander") as string,
    interaction_chance: (p.interactionChance ?? p.interaction_chance ?? 0) as number,
    ball_interest: (p.ballInterest ?? p.ball_interest ?? 0) as number,
    chat_emojis: (p.chatEmojis ?? p.chat_emojis ?? []) as string[],
  };
}

function convertBackendConfig(bc: Record<string, unknown> | undefined) {
  if (!bc) return undefined;
  return {
    backend_id: (bc.backendId ?? bc.backend_id ?? "echo") as string,
    model: (bc.model ?? undefined) as string | undefined,
    awareness_model: (bc.awarenessModel ?? bc.awareness_model ?? undefined) as string | undefined,
    system_prompt: (bc.systemPrompt ?? bc.system_prompt ?? undefined) as string | undefined,
    custom_agent: (bc.customAgent ?? bc.custom_agent ?? undefined) as string | undefined,
    awareness_level: (bc.awarenessLevel ?? bc.awareness_level ?? 0) as number,
    tts_enabled: (bc.ttsEnabled ?? bc.tts_enabled ?? false) as boolean,
    cwd: (bc.cwd ?? undefined) as string | undefined,
  };
}

function convertAgent(a: Record<string, unknown>): Agent {
  return {
    id: a.id as string,
    name: a.name as string,
    avatar: a.avatar as string,
    position: a.position as { x: number; y: number },
    velocity: a.velocity as { x: number; y: number },
    state: a.state as Agent["state"],
    direction: a.direction as Agent["direction"],
    personality: convertPersonality(a.personality as Record<string, unknown>),
    target: a.target as { x: number; y: number } | null,
    state_timer: (a.stateTimer ?? a.state_timer ?? 0) as number,
    interaction_cooldown: (a.interactionCooldown ?? a.interaction_cooldown ?? 0) as number,
    gear: (a.gear ?? []) as string[],
    backend_config: convertBackendConfig(
      (a.backendConfig ?? a.backend_config) as Record<string, unknown> | undefined,
    ),
  };
}

function convertBall(b: Record<string, unknown>): Ball {
  return {
    position: b.position as { x: number; y: number },
    velocity: b.velocity as { x: number; y: number },
    active: b.active as boolean,
    captures: (b.captures ?? 0) as number,
    height: (b.height ?? 0) as number,
    height_velocity: (b.heightVelocity ?? b.height_velocity ?? 0) as number,
  };
}

function convertDroppedFile(f: Record<string, unknown>): DroppedFile {
  return {
    id: f.id as string,
    files: (f.files ?? []) as [string, string][],
    label: (f.label ?? "") as string,
    icon_data_url: (f.iconDataUrl ?? f.icon_data_url ?? null) as string | null,
    position: f.position as { x: number; y: number },
    claimed_by: (f.claimedBy ?? f.claimed_by ?? null) as string | null,
    active: f.active as boolean,
    height: (f.height ?? 0) as number,
    height_velocity: (f.heightVelocity ?? f.height_velocity ?? 0) as number,
  };
}

function convertBubble(b: Record<string, unknown>): ChatBubble {
  return {
    agent_id: (b.agentId ?? b.agent_id) as string,
    content: b.content as string,
    timer: b.timer as number,
    is_emoji: (b.isEmoji ?? b.is_emoji ?? false) as boolean,
    is_event: (b.isEvent ?? b.is_event ?? false) as boolean,
  };
}

function convertMessage(m: Record<string, unknown>): ChatMessage {
  return {
    from_user: (m.fromUser ?? m.from_user) as boolean,
    text: m.text as string,
  };
}

function convertChatSession(s: Record<string, unknown>): ChatSession {
  return {
    agent_id: (s.agentId ?? s.agent_id) as string,
    messages: ((s.messages ?? []) as Record<string, unknown>[]).map(convertMessage),
    active: s.active as boolean,
  };
}

function convertWorldState(raw: Record<string, unknown>): WorldState {
  return {
    agents: ((raw.agents ?? []) as Record<string, unknown>[]).map(convertAgent),
    ball: raw.ball ? convertBall(raw.ball as Record<string, unknown>) : null,
    dropped_files: ((raw.droppedFiles ?? raw.dropped_files ?? []) as Record<string, unknown>[]).map(
      convertDroppedFile,
    ),
    bubbles: ((raw.bubbles ?? []) as Record<string, unknown>[]).map(convertBubble),
    chat_sessions: ((raw.chatSessions ?? raw.chat_sessions ?? []) as Record<string, unknown>[]).map(
      convertChatSession,
    ),
    bounds: raw.bounds as { x: number; y: number },
    ground_y_ratio: (raw.groundYRatio ?? raw.ground_y_ratio ?? 0.6) as number,
    tick: (raw.tick ?? 0) as number,
    attention_interval_secs: (raw.attentionIntervalSecs ?? raw.attention_interval_secs ?? 5) as number,
    pending_files: (raw.pendingFiles ?? raw.pending_files ?? {}) as Record<string, [string, string][]>,
  };
}

// ── Pending request tracking for request/response commands ──────────

type PendingResolve = (value: string) => void;
const pendingRequests = new Map<number, PendingResolve>();
let nextRequestId = 1;

// ── Hook ────────────────────────────────────────────────────────────

export function useWorldState() {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const vscode = useRef(getVsCodeApi());

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "worldState":
          setWorldState(convertWorldState(msg.state));
          break;
        case "sendMessageResult": {
          const resolve = pendingRequests.get(msg.requestId);
          if (resolve) {
            pendingRequests.delete(msg.requestId);
            resolve(msg.reply ?? "");
          }
          break;
        }
        case "dropFilesResult": {
          const resolve = pendingRequests.get(msg.requestId);
          if (resolve) {
            pendingRequests.delete(msg.requestId);
            resolve(msg.fileId ?? "");
          }
          break;
        }
      }
    }

    window.addEventListener("message", handleMessage);
    // Tell the extension host we're ready to receive state
    vscode.current.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const post = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      vscode.current.postMessage({ type, ...payload });
    },
    [],
  );

  const throwBall = useCallback(
    async (x: number, y: number, vx: number, vy: number) => {
      post("throwBall", { x, y, vx, vy });
    },
    [post],
  );

  const dropFiles = useCallback(
    async (files: [string, string][], x: number, y: number): Promise<string> => {
      const requestId = nextRequestId++;
      return new Promise((resolve) => {
        pendingRequests.set(requestId, resolve);
        vscode.current.postMessage({ type: "dropFiles", files, x, y, requestId });
      });
    },
    [],
  );

  const removeDroppedFile = useCallback(
    async (fileId: string) => {
      post("removeDroppedFile", { fileId });
    },
    [post],
  );

  const detachAgentFile = useCallback(
    async (agentId: string) => {
      post("detachAgentFile", { agentId });
    },
    [post],
  );

  const clickAgent = useCallback(
    async (agentId: string) => {
      post("clickAgent", { agentId });
    },
    [post],
  );

  const sendMessage = useCallback(
    async (agentId: string, text: string): Promise<string> => {
      const requestId = nextRequestId++;
      return new Promise((resolve) => {
        pendingRequests.set(requestId, resolve);
        vscode.current.postMessage({ type: "sendMessage", agentId, text, requestId });
      });
    },
    [],
  );

  const dismissChat = useCallback(
    async (agentId: string) => {
      post("dismissChat", { agentId });
    },
    [post],
  );

  const clearChat = useCallback(
    async (agentId: string) => {
      post("clearChat", { agentId });
    },
    [post],
  );

  const resizeWorld = useCallback(
    async (width: number, height: number) => {
      post("resize", { width, height });
    },
    [post],
  );

  const addAgent = useCallback(
    async (avatar: string, name: string): Promise<string> => {
      const requestId = nextRequestId++;
      return new Promise((resolve) => {
        pendingRequests.set(requestId, resolve);
        vscode.current.postMessage({ type: "addAgent", avatar, name, requestId });
      });
    },
    [],
  );

  const removeAgent = useCallback(
    async (agentId: string) => {
      post("removeAgent", { agentId });
    },
    [post],
  );

  const setGear = useCallback(
    async (agentId: string, gearIds: string[]) => {
      post("setGear", { agentId, gearIds });
    },
    [post],
  );

  const requestAttention = useCallback(
    async (agentId: string) => {
      post("requestAttention", { agentId });
    },
    [post],
  );

  const dismissAttention = useCallback(
    async (agentId: string) => {
      post("dismissAttention", { agentId });
    },
    [post],
  );

  const setBackendConfig = useCallback(
    async (
      agentId: string,
      backendConfig: {
        backend_id: string;
        model?: string;
        system_prompt?: string;
        custom_agent?: string;
        awareness_level?: number;
        cwd?: string;
      },
    ) => {
      post("setBackendConfig", { agentId, config: backendConfig });
    },
    [post],
  );

  const renameAgent = useCallback(
    async (agentId: string, name: string) => {
      post("renameAgent", { agentId, name });
    },
    [post],
  );

  const updateMouse = useCallback(
    async (x: number | null, y: number | null) => {
      post("updateMouse", { x, y });
    },
    [post],
  );

  const saveConfig = useCallback(
    async (
      theme: string,
      _windowBounds?: { x: number; y: number; width: number; height: number },
      musicMuted?: boolean,
      dynamicSky?: boolean,
    ) => {
      post("saveConfig", { theme, musicMuted, dynamicSky });
    },
    [post],
  );

  const loadConfig = useCallback(async () => {
    // Config is managed by the extension host; return null
    return null;
  }, []);

  const popOutChat = useCallback(
    async (agentId: string) => {
      post("popOutChat", { agentId });
    },
    [post],
  );

  return {
    worldState,
    throwBall,
    dropFiles,
    removeDroppedFile,
    detachAgentFile,
    clickAgent,
    sendMessage,
    dismissChat,
    clearChat,
    popOutChat,
    resizeWorld,
    addAgent,
    removeAgent,
    setGear,
    requestAttention,
    dismissAttention,
    setBackendConfig,
    renameAgent,
    updateMouse,
    saveConfig,
    loadConfig,
  };
}
