import { useCallback, useEffect } from "react";
import { useWorldState } from "./hooks/useWorldState";
import { TerrariumCanvas } from "./components/TerrariumCanvas";
import { ChatOverlay } from "./components/ChatOverlay";
import { AnimatedBackground } from "./components/AnimatedBackground";
import "./App.css";

function App() {
  const {
    worldState,
    throwBall,
    clickAgent,
    sendMessage,
    dismissChat,
    resizeWorld,
  } = useWorldState();

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
  }, [worldState, dismissChat]);

  // Find active chat sessions
  const activeSessions =
    worldState?.chat_sessions.filter((s) => s.active) ?? [];

  return (
    <div className="terrarium-container">
      <AnimatedBackground theme="meadow" />
      <TerrariumCanvas
        worldState={worldState}
        onAgentClick={handleAgentClick}
        onBallThrow={throwBall}
        onBackgroundClick={handleCanvasClick}
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
    </div>
  );
}

export default App;
