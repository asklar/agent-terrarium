import { useCallback, useEffect, useRef, useState } from "react";
import { useWorldState } from "./hooks/useWorldState";
import { TerrariumCanvas } from "./components/TerrariumCanvas";
import { ChatOverlay } from "./components/ChatOverlay";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { WindowFrame } from "./components/WindowFrame";
import { ThemeMusic } from "./components/ThemeMusic";
import { ContextMenu } from "./components/ContextMenu";
import { registry } from "./themes";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function App() {
  const [registryReady, setRegistryReady] = useState(registry.loaded);

  useEffect(() => {
    if (!registryReady) {
      registry.ready.then(() => setRegistryReady(true));
    }
  }, [registryReady]);

  const {
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
  } = useWorldState();

  const [theme, setTheme] = useState("meadow");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Load config on mount and restore window position
  useEffect(() => {
    loadConfig().then(async (config) => {
      if (config?.theme) {
        setTheme(config.theme);
      }
      const w = (config as Record<string, unknown> | null)?.window as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      if (w) {
        const win = getCurrentWindow();
        await win.setPosition(new (await import("@tauri-apps/api/dpi")).LogicalPosition(w.x, w.y));
        await win.setSize(new (await import("@tauri-apps/api/dpi")).LogicalSize(w.width, w.height));
      }
    });
  }, [loadConfig]);

  // Save window bounds on move/resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const saveWindowBounds = async () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const win = getCurrentWindow();
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          saveConfig(themeRef.current, {
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
          });
        } catch { /* ignore */ }
      }, 500);
    };

    const unlistenMove = getCurrentWindow().onMoved(saveWindowBounds);
    const unlistenResize = getCurrentWindow().onResized(saveWindowBounds);

    return () => {
      clearTimeout(timer);
      unlistenMove.then((f) => f());
      unlistenResize.then((f) => f());
    };
  }, [saveConfig]);

  // Save config when theme changes (debounced after first render)
  const initialRef = useRef(true);
  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    saveConfig(theme);
  }, [theme, saveConfig]);

  // Sync canvas size to world bounds
  useEffect(() => {
    const handleResize = () => {
      resizeWorld(window.innerWidth, window.innerHeight);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizeWorld]);

  // Handle agents needing attention: flash taskbar + play sound periodically
  const attentionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAttentionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const needingAttention = worldState?.agents.filter(
      (a) => a.state === "NeedsAttention",
    ) ?? [];
    const currentIds = new Set(needingAttention.map((a) => a.id));

    // New agents that just started needing attention
    for (const id of currentIds) {
      if (!prevAttentionRef.current.has(id)) {
        // Flash taskbar once when attention first requested
        getCurrentWindow().requestUserAttention(2).catch(() => {});
      }
    }
    prevAttentionRef.current = currentIds;

    // Set up periodic sound + flash
    if (needingAttention.length > 0 && !attentionTimerRef.current) {
      const intervalMs = (worldState?.attention_interval_secs ?? 5) * 1000;
      attentionTimerRef.current = setInterval(() => {
        getCurrentWindow().requestUserAttention(2).catch(() => {});
      }, intervalMs);
    } else if (needingAttention.length === 0 && attentionTimerRef.current) {
      clearInterval(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }

    return () => {};
  }, [worldState?.agents, worldState?.attention_interval_secs]);

  // Clean up attention timer on unmount
  useEffect(() => {
    return () => {
      if (attentionTimerRef.current) {
        clearInterval(attentionTimerRef.current);
      }
    };
  }, []);

  const handleAgentClick = useCallback(
    async (agentId: string) => {
      // If agent needs attention, dismiss it first
      const agent = worldState?.agents.find((a) => a.id === agentId);
      if (agent?.state === "NeedsAttention") {
        await dismissAttention(agentId);
      }
      await clickAgent(agentId);
    },
    [clickAgent, dismissAttention, worldState?.agents],
  );

  const handleDismiss = useCallback(
    async (agentId: string) => {
      await dismissChat(agentId);
    },
    [dismissChat],
  );

  const handleCanvasClick = useCallback(() => {
    // Light dismiss: clicking canvas (not on an agent) dismisses all chats
    const sessions = worldState?.chat_sessions.filter((s) => s.active) ?? [];
    for (const session of sessions) {
      dismissChat(session.agent_id);
    }
    setContextMenu(null);
  }, [worldState, dismissChat]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Shift+right-click opens the native context menu (useful for Inspect Element)
      if (e.shiftKey) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  // Find active chat sessions
  const activeSessions =
    worldState?.chat_sessions.filter((s) => s.active) ?? [];

  if (!registryReady) {
    return <div className="terrarium-container" style={{ background: "#1a1a2e" }} />;
  }

  return (
    <div className="terrarium-container" onContextMenu={handleContextMenu}>
      <WindowFrame />
      <AnimatedBackground theme={theme} />
      <ThemeMusic theme={theme} />
      <TerrariumCanvas
        worldState={worldState}
        onAgentClick={handleAgentClick}
        onBallThrow={throwBall}
        onBackgroundClick={handleCanvasClick}
        onMouseUpdate={updateMouse}
      />
      {activeSessions.map((session) => {
        const agent = worldState?.agents.find(
          (a) => a.id === session.agent_id,
        );
        if (!agent) return null;
        return (
          <ChatOverlay
            key={session.agent_id}
            session={session}
            agentPosition={agent.position}
            agentName={agent.name}
            onSend={sendMessage}
            onDismiss={handleDismiss}
          />
        );
      })}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          agents={worldState?.agents ?? []}
          currentTheme={theme}
          onClose={() => setContextMenu(null)}
          onThemeChange={setTheme}
          onAddAgent={async (avatar, name) => {
            await addAgent(avatar, name);
            saveConfig(theme);
          }}
          onRemoveAgent={async (agentId) => {
            await removeAgent(agentId);
            saveConfig(theme);
          }}
          onSetGear={async (agentId, gearIds) => {
            await setGear(agentId, gearIds);
            saveConfig(theme);
          }}
          onRequestAttention={(agentId) => {
            setTimeout(() => requestAttention(agentId), 5000);
          }}
        />
      )}
    </div>
  );
}

export default App;
