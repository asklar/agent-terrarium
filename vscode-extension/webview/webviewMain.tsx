import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useWorldState } from "./ipcAdapter";
import { initRegistryAdapter } from "./registryAdapter";
import { TerrariumCanvas } from "../../src/components/TerrariumCanvas";
import { ChatOverlay } from "../../src/components/ChatOverlay";
import { AnimatedBackground } from "../../src/components/AnimatedBackground";
import { registry } from "../../src/themes";
import { playAgentSound } from "../../src/audio/agentSounds";
import "../../src/App.css";

// ── VS Code API ─────────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// Initialize registry adapter to receive packages from extension host
initRegistryAdapter(vscode);

// ── App ─────────────────────────────────────────────────────────────

function App() {
  const {
    worldState,
    throwBall,
    clickAgent,
    sendMessage,
    dismissChat,
    resizeWorld,
    removeDroppedFile,
    detachAgentFile,
    dropFiles,
    updateMouse,
    saveConfig,
  } = useWorldState();

  const [theme, setTheme] = useState("meadow");
  const [thinkingAgentIds, setThinkingAgentIds] = useState<Set<string>>(new Set());

  // Load theme from extension host config
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (msg?.type === "loadConfigResult" && msg.config?.theme) {
        setTheme(msg.config.theme);
      }
    }
    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "loadConfig" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Sync canvas size to world bounds
  useEffect(() => {
    const handleResize = () => resizeWorld(window.innerWidth, window.innerHeight);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizeWorld]);

  // HTML5 drag-and-drop for files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const container = document.querySelector(".terrarium-container");
      const rect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const fileList: [string, string][] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        fileList.push([f.name, (f as File & { path?: string }).path ?? f.name]);
      }
      if (fileList.length > 0) {
        await dropFiles(fileList, x, y);
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [dropFiles]);

  // Handle file claims by agents
  const handledClaimsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!worldState) return;
    for (const file of worldState.dropped_files) {
      if (file.claimed_by && file.active) {
        const agentId = file.claimed_by;
        if (handledClaimsRef.current.has(file.id)) continue;
        handledClaimsRef.current.add(file.id);

        const agent = worldState.agents.find((a) => a.id === agentId);
        if (agent) {
          playAgentSound(agent.avatar, "gear");
          vscode.postMessage({ type: "setPendingFiles", agentId, files: file.files });
          detachAgentFile(agentId);
          if (agent.state !== "Chatting") clickAgent(agentId);
        }
      }
    }
    const activeIds = new Set(worldState.dropped_files.map((f) => f.id));
    for (const id of handledClaimsRef.current) {
      if (!activeIds.has(id)) handledClaimsRef.current.delete(id);
    }
  }, [worldState, clickAgent, detachAgentFile]);

  const handleAgentClick = useCallback(
    async (agentId: string) => {
      const agent = worldState?.agents.find((a) => a.id === agentId);
      if (agent?.state === "NeedsAttention") {
        vscode.postMessage({ type: "dismissAttention", agentId });
      }
      await clickAgent(agentId);
    },
    [clickAgent, worldState?.agents],
  );

  const handleCanvasClick = useCallback(() => {
    const sessions = worldState?.chat_sessions.filter((s) => s.active) ?? [];
    for (const session of sessions) {
      dismissChat(session.agent_id);
    }
  }, [worldState, dismissChat]);

  const sendMessageWithThinking = useCallback(
    async (agentId: string, text: string): Promise<string> => {
      setThinkingAgentIds((prev) => new Set(prev).add(agentId));
      try {
        return await sendMessage(agentId, text);
      } finally {
        setThinkingAgentIds((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [sendMessage],
  );

  const playReplyChirp = useCallback(
    (agentId: string) => {
      const agent = worldState?.agents.find((a) => a.id === agentId);
      if (agent) playAgentSound(agent.avatar, "chat");
    },
    [worldState?.agents],
  );

  const activeSessions =
    worldState?.chat_sessions.filter((s) => s.active) ?? [];

  if (!worldState) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "var(--vscode-font-family)",
          color: "var(--vscode-foreground)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>🏡 Agent Terrarium</h2>
          <p>Waiting for simulation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="terrarium-container">
      <AnimatedBackground theme={theme} />
      <TerrariumCanvas
        worldState={worldState}
        onAgentClick={handleAgentClick}
        onBallThrow={throwBall}
        onBackgroundClick={handleCanvasClick}
        onMouseUpdate={updateMouse}
        onRemoveDroppedFile={removeDroppedFile}
        thinkingAgentIds={thinkingAgentIds}
      />
      {activeSessions.map((session) => {
        const agent = worldState.agents.find((a) => a.id === session.agent_id);
        if (!agent) return null;
        return (
          <ChatOverlay
            key={session.agent_id}
            session={session}
            agentPosition={agent.position}
            agentName={agent.name}
            pendingFiles={worldState.pending_files[session.agent_id]}
            onRemovePendingFile={() => {
              vscode.postMessage({ type: "clearPendingFiles", agentId: session.agent_id });
            }}
            onSend={sendMessageWithThinking}
            onDismiss={dismissChat}
            onReply={playReplyChirp}
          />
        );
      })}
    </div>
  );
}

// ── Mount ────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
