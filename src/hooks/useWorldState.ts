import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WorldState } from "../types/world";

export function useWorldState() {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const animFrameRef = useRef<number>(0);

  const pollState = useCallback(async () => {
    try {
      const state = await invoke<WorldState>("get_world_state");
      setWorldState(state);
    } catch (e) {
      console.error("Failed to get world state:", e);
    }
    animFrameRef.current = requestAnimationFrame(pollState);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(pollState);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [pollState]);

  const throwBall = useCallback(
    async (x: number, y: number, vx: number, vy: number) => {
      await invoke("throw_ball", { x, y, vx, vy });
    },
    [],
  );

  const clickAgent = useCallback(async (agentId: string) => {
    await invoke("click_agent", { agentId });
  }, []);

  const sendMessage = useCallback(
    async (agentId: string, text: string): Promise<string> => {
      return await invoke<string>("send_message", { agentId, text });
    },
    [],
  );

  const dismissChat = useCallback(async (agentId: string) => {
    await invoke("dismiss_chat", { agentId });
  }, []);

  const resizeWorld = useCallback(async (width: number, height: number) => {
    await invoke("resize_world", { width, height });
  }, []);

  const addAgent = useCallback(async (avatar: string, name: string) => {
    await invoke("add_agent", { avatar, name });
  }, []);

  const removeAgent = useCallback(async (agentId: string) => {
    await invoke("remove_agent", { agentId });
  }, []);

  const setGear = useCallback(async (agentId: string, gearIds: string[]) => {
    await invoke("set_gear", { agentId, gearIds });
  }, []);

  const requestAttention = useCallback(async (agentId: string) => {
    await invoke("request_attention", { agentId });
  }, []);

  const dismissAttention = useCallback(async (agentId: string) => {
    await invoke("dismiss_attention", { agentId });
  }, []);

  const updateMouse = useCallback(async (x: number | null, y: number | null) => {
    await invoke("update_mouse", { x, y });
  }, []);

  const saveConfig = useCallback(async (theme: string, windowBounds?: { x: number; y: number; width: number; height: number }) => {
    try {
      await invoke("save_config", {
        theme,
        windowX: windowBounds?.x ?? null,
        windowY: windowBounds?.y ?? null,
        windowWidth: windowBounds?.width ?? null,
        windowHeight: windowBounds?.height ?? null,
      });
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      return await invoke<{ theme: string; agents: unknown[] }>("load_config");
    } catch {
      return null;
    }
  }, []);

  return {
    worldState,
    throwBall,
    clickAgent,
    sendMessage,
    dismissChat,
    resizeWorld,
    addAgent,
    removeAgent,
    setGear,
    requestAttention,
    dismissAttention,
    updateMouse,
    saveConfig,
    loadConfig,
  };
}
