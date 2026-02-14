import { useCallback, useEffect, useRef, useState } from "react";
import { useWorldState } from "./hooks/useWorldState";
import { TerrariumCanvas } from "./components/TerrariumCanvas";
import { ChatOverlay } from "./components/ChatOverlay";
import { AnimatedBackground, type ThemeName } from "./components/AnimatedBackground";
import { WindowFrame } from "./components/WindowFrame";
import { ContextMenu } from "./components/ContextMenu";
import "./App.css";

function App() {
  const {
    worldState,
    throwBall,
    clickAgent,
    sendMessage,
    dismissChat,
    resizeWorld,
    addAgent,
    removeAgent,
    updateMouse,
    saveConfig,
    loadConfig,
  } = useWorldState();

  const [theme, setTheme] = useState<ThemeName>("meadow");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Load config on mount
  useEffect(() => {
    loadConfig().then((config) => {
      if (config?.theme) {
        setTheme(config.theme as ThemeName);
      }
    });
  }, [loadConfig]);

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

  const handleAgentClick = useCallback(
    async (agentId: string) => {
      await clickAgent(agentId);
    },
    [clickAgent],
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

  return (
    <div className="terrarium-container" onContextMenu={handleContextMenu}>
      <WindowFrame />
      <AnimatedBackground theme={theme} />
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
        />
      )}
    </div>
  );
}

export default App;
