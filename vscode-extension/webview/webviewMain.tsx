import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useWorldState, vscodeApi } from "./ipcAdapter";
import { initRegistryAdapter } from "./registryAdapter";
import { TerrariumCanvas } from "../../src/components/TerrariumCanvas";
import { ChatOverlay } from "../../src/components/ChatOverlay";
import { AnimatedBackground } from "../../src/components/AnimatedBackground";
import { ContextMenu } from "../../src/components/ContextMenu";
import { registry } from "../../src/themes";
import { playAgentSound } from "../../src/audio/agentSounds";
import { speak } from "./tts";
import "../../src/App.css";

// ── VS Code API ─────────────────────────────────────────────────────

const vscode = vscodeApi;

// Initialize registry adapter to receive packages from extension host
initRegistryAdapter(vscode);

// ── Asset URL rewriting ─────────────────────────────────────────────
// The shared components load images from "/packages/...", which works in
// the Tauri app (Vite dev server). In VS Code webviews, we rewrite these
// to webview URIs embedded in the HTML by the extension host.

declare global {
  interface Window {
    __PACKAGES_BASE_URI__?: string;
    __USER_PACKAGES_BASE_URI__?: string;
  }
}

const packagesBaseUri = window.__PACKAGES_BASE_URI__ || "";
const userPackagesBaseUri = window.__USER_PACKAGES_BASE_URI__ || "";
console.log("[AT] Asset base URIs:", packagesBaseUri ? "set" : "empty", userPackagesBaseUri ? "set" : "empty");

// Monkey-patch Image.src to rewrite /packages/ URLs
try {
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
  if (originalDescriptor && originalDescriptor.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      set(value: string) {
        let rewritten = value;
        if (typeof value === "string" && value.startsWith("/packages/") && (packagesBaseUri || userPackagesBaseUri)) {
          const relPath = value.replace(/^\/packages\//, "").replace(/\?.*$/, "");
          // Try user packages first (custom themes), fall back to built-in
          if (userPackagesBaseUri) {
            rewritten = `${userPackagesBaseUri}/${relPath}`;
            const self = this;
            this.onerror = () => {
              if (packagesBaseUri) {
                originalDescriptor.set!.call(self, `${packagesBaseUri}/${relPath}`);
              }
            };
          } else if (packagesBaseUri) {
            rewritten = `${packagesBaseUri}/${relPath}`;
          }
        }
        originalDescriptor.set!.call(this, rewritten);
      },
      get() {
        return originalDescriptor.get!.call(this);
      },
      configurable: true,
    });
    console.log("[AT] Image.src monkey-patch installed");
  }
} catch (e) {
  console.error("[AT] Failed to install Image.src monkey-patch:", e);
}

// ── App ─────────────────────────────────────────────────────────────

function App() {
  const {
    worldState,
    throwBall,
    clickAgent,
    sendMessage,
    dismissChat,
    clearChat,
    popOutChat,
    resizeWorld,
    removeDroppedFile,
    detachAgentFile,
    dropFiles,
    updateMouse,
    saveConfig,
    addAgent,
    removeAgent,
    setGear,
    renameAgent,
    setBackendConfig,
  } = useWorldState();

  const [theme, setTheme] = useState("meadow");
  const [dynamicSky, setDynamicSky] = useState(false);
  const [thinkingAgentIds, setThinkingAgentIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  // Mouse tracking (throttled to 50ms) for agent hover reactions
  useEffect(() => {
    let lastSent = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSent < 50) return;
      lastSent = now;
      updateMouse(e.clientX, e.clientY);
    };
    const handleMouseLeave = () => {
      updateMouse(null, null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [updateMouse]);

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
        const reply = await sendMessage(agentId, text);
        // TTS: speak the reply if the agent has TTS enabled
        const agent = worldState?.agents.find((a) => a.id === agentId);
        if (agent?.backend_config?.tts_enabled && reply) {
          speak(reply);
        }
        return reply;
      } finally {
        setThinkingAgentIds((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }
    },
    [sendMessage, worldState?.agents],
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
    console.log("[Agent Terrarium] No worldState yet, showing placeholder");
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "var(--vscode-font-family)",
          color: "var(--vscode-foreground)",
          background: "var(--vscode-sideBar-background, #252526)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>🏡 Agent Terrarium</h2>
          <p>Waiting for simulation…</p>
        </div>
      </div>
    );
  }

  // Render terrarium

  return (
    <div className="terrarium-container" onContextMenu={(e) => {
      if (e.shiftKey) return; // Shift+right-click for native menu
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }}>
      <AnimatedBackground theme={theme} dynamicSky={dynamicSky} />
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
            onNewSession={(agentId) => clearChat(agentId)}
            onConfigure={(agentId) => {
              vscode.postMessage({ type: "configureAgent", agentId });
            }}
            onPopOut={(agentId) => popOutChat(agentId)}
          />
        );
      })}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          agents={worldState.agents}
          currentTheme={theme}
          dynamicSky={dynamicSky}
          onClose={() => setContextMenu(null)}
          onThemeChange={(t) => { setTheme(t); saveConfig(t); }}
          onDynamicSkyToggle={() => setDynamicSky((d) => !d)}
          onAddAgent={(avatar, name) => addAgent(avatar, name)}
          onRemoveAgent={(agentId) => removeAgent(agentId)}
          onSetGear={(agentId, gearIds) => setGear(agentId, gearIds)}
          onToggleDebug={() => { vscode.postMessage({ type: "toggleDebug" }); }}
          debugOpen={false}
          onAbout={() => { vscode.postMessage({ type: "showAbout" }); }}
        />
      )}
    </div>
  );
}

// ── Mount ────────────────────────────────────────────────────────────

console.log("[Agent Terrarium] Webview script loaded");

const rootEl = document.getElementById("root");
if (rootEl) {
  console.log("[Agent Terrarium] Mounting React app...");
  try {
    createRoot(rootEl).render(<App />);
    console.log("[Agent Terrarium] React app mounted");
  } catch (e) {
    console.error("[Agent Terrarium] Failed to mount:", e);
    rootEl.textContent = `Error: ${e}`;
  }
} else {
  console.error("[Agent Terrarium] #root element not found!");
}
