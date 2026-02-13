import { useCallback } from "react";
import { useWorldState } from "./hooks/useWorldState";
import { TerrariumCanvas } from "./components/TerrariumCanvas";
import { ChatOverlay } from "./components/ChatOverlay";
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
  const handleResize = useCallback(() => {
    resizeWorld(window.innerWidth, window.innerHeight);
  }, [resizeWorld]);

  // Resize on mount
  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleResize);
    // Initial resize
    setTimeout(handleResize, 100);
  }

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

  // Find active chat sessions
  const activeSessions =
    worldState?.chat_sessions.filter((s) => s.active) ?? [];

  return (
    <div
      className="terrarium-container"
      onClick={() => {
        // Light dismiss: clicking background dismisses all chats
        for (const session of activeSessions) {
          dismissChat(session.agent_id);
        }
      }}
    >
      <TerrariumCanvas
        worldState={worldState}
        onAgentClick={handleAgentClick}
        onBallThrow={throwBall}
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
