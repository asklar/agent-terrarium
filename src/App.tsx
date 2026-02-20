import { useCallback, useEffect, useRef, useState } from "react";
import { useWorldState } from "./hooks/useWorldState";
import { TerrariumCanvas } from "./components/TerrariumCanvas";
import { ChatOverlay } from "./components/ChatOverlay";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { WindowFrame } from "./components/WindowFrame";
import { ThemeMusic } from "./components/ThemeMusic";
import { WeatherWidget } from "./components/WeatherWidget";
import { ContextMenu } from "./components/ContextMenu";
import { AgentConfigDialog } from "./components/AgentConfigDialog";
import { AboutDialog } from "./components/AboutDialog";
import { DebugPanel } from "./components/DebugPanel";
import { registry } from "./themes";
import { playAgentSound } from "./audio/agentSounds";
import { fetchLocation, fetchWeather, getLocation } from "./weather/weatherService";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { log } from "./utils/log";
import "./App.css";
import type { Agent } from "./types/world";

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const splashWaitRef = useRef(false);

  const dismissSplash = useCallback(() => {
    setSplashFading(true);
    setTimeout(() => setShowSplash(false), 500);
  }, []);

  useEffect(() => {
    const splashStart = Date.now();
    const init = async () => {
      // Check CLI flag
      try {
        splashWaitRef.current = await invoke<boolean>("get_splash_wait");
      } catch { /* default false */ }

      if (!registry.loaded) await registry.ready;

      const elapsed = Date.now() - splashStart;
      const remaining = Math.max(0, 2000 - elapsed);

      if (splashWaitRef.current) {
        // Wait for click — but still enforce minimum 2s
        setTimeout(() => { /* min time passed, click handler will dismiss */ }, remaining);
      } else {
        setTimeout(dismissSplash, remaining);
      }
    };
    init();
  }, [dismissSplash]);

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
    setBackendConfig,
    renameAgent,
    updateMouse,
    saveConfig,
    loadConfig,
  } = useWorldState();

  const [theme, setTheme] = useState("meadow");
  const [themeVersion, setThemeVersion] = useState(0);
  const [dynamicSky, setDynamicSky] = useState(false);
  const [debugTime, setDebugTime] = useState<number | null>(null);
  const [debugWeather, setDebugWeather] = useState<string | null>(null);
  const [musicMuted, setMusicMuted] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [thinkingAgentIds, setThinkingAgentIds] = useState<Set<string>>(new Set());
  const [poppedOutAgents, setPoppedOutAgents] = useState<Set<string>>(new Set());
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const musicMutedRef = useRef(musicMuted);
  musicMutedRef.current = musicMuted;
  const dynamicSkyRef = useRef(dynamicSky);
  dynamicSkyRef.current = dynamicSky;
  const configLoadedRef = useRef(false);

  // Load config on mount and restore window position
  useEffect(() => {
    loadConfig().then(async (config) => {
      if (config?.theme) {
        setTheme(config.theme);
      }
      if ((config as Record<string, unknown> | null)?.dynamic_sky) {
        setDynamicSky(true);
      }
      if ((config as Record<string, unknown> | null)?.music_muted) {
        setMusicMuted(true);
      }
      const w = (config as Record<string, unknown> | null)?.window as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      if (w) {
        log.info("Restoring window bounds:", w);
        const win = getCurrentWindow();
        const monitor = await currentMonitor();
        let { x, y, width, height } = w;
        if (monitor) {
          const mw = monitor.size.width / (monitor.scaleFactor ?? 1);
          const mh = monitor.size.height / (monitor.scaleFactor ?? 1);
          width = Math.min(width, mw);
          height = Math.min(height, mh);
          x = Math.max(0, Math.min(x, mw - width));
          y = Math.max(0, Math.min(y, mh - height));
        }
        await win.setPosition(new (await import("@tauri-apps/api/dpi")).LogicalPosition(x, y));
        await win.setSize(new (await import("@tauri-apps/api/dpi")).LogicalSize(width, height));
      }
      configLoadedRef.current = true;
    });
  }, [loadConfig]);

  // Centralized weather fetching — single source for both dynamic sky and weather widget
  useEffect(() => {
    fetchLocation().then((loc) => {
      if (loc) {
        log.info("Fetching weather for", loc.city ?? `${loc.lat},${loc.lon}`);
        fetchWeather(loc).catch(() => {});
      }
    }).catch(() => {});
    const id = setInterval(() => {
      const loc = getLocation();
      if (loc) fetchWeather(loc).catch(() => {});
    }, 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Save window bounds on move/resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const saveWindowBounds = async () => {
      if (!configLoadedRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const win = getCurrentWindow();
          const monitor = await currentMonitor();
          const scale = monitor?.scaleFactor ?? 1;
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          saveConfig(themeRef.current, {
            x: Math.round(pos.x / scale),
            y: Math.round(pos.y / scale),
            width: Math.round(size.width / scale),
            height: Math.round(size.height / scale),
          }, musicMutedRef.current, dynamicSkyRef.current);
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
    saveConfig(theme, undefined, musicMutedRef.current, dynamicSkyRef.current);
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

    // Auto-dismiss attention for agents whose chat is popped out
    for (const id of currentIds) {
      if (poppedOutAgents.has(id)) {
        dismissAttention(id);
        currentIds.delete(id);
      }
    }

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
  }, [worldState?.agents, worldState?.attention_interval_secs, poppedOutAgents, dismissAttention]);

  // Clean up attention timer on unmount
  useEffect(() => {
    return () => {
      if (attentionTimerRef.current) {
        clearInterval(attentionTimerRef.current);
      }
    };
  }, []);

  const playReplyChirp = useCallback((agentId: string) => {
    const agent = worldState?.agents.find((a) => a.id === agentId);
    if (agent) playAgentSound(agent.avatar, "chat");
  }, [worldState?.agents]);

  const sendMessageWithThinking = useCallback(
    async (agentId: string, text: string): Promise<string> => {
      log.info("Sending message to", agentId, text.slice(0, 80));
      setThinkingAgentIds((prev) => new Set(prev).add(agentId));
      try {
        const reply = await sendMessage(agentId, text);
        log.info("Reply from", agentId, reply.slice(0, 80));
        return reply;
      } catch (e) {
        log.error("Send message failed for", agentId, e);
        throw e;
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

  const playGearSound = useCallback((agentId: string) => {
    const agent = worldState?.agents.find((a) => a.id === agentId);
    if (agent) playAgentSound(agent.avatar, "gear");
  }, [worldState?.agents]);

  const handleAgentClick = useCallback(
    async (agentId: string) => {
      log.debug("Agent clicked:", agentId);
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

  const handlePopOut = useCallback(
    async (agentId: string) => {
      log.info("Popping out chat for", agentId);
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const label = `chat-${agentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const mainWin = getCurrentWindow();
        const pos = await mainWin.outerPosition();
        const size = await mainWin.outerSize();
        const chatWin = new WebviewWindow(label, {
          url: `index.html?chat=${encodeURIComponent(agentId)}`,
          title: `Chat — ${agentId}`,
          width: 360,
          height: 500,
          x: pos.x + size.width + 8,
          y: pos.y,
          decorations: true,
          transparent: false,
          alwaysOnTop: false,
          resizable: true,
        });
        chatWin.once("tauri://created", () => {
          log.info("Chat window created for", agentId);
          setPoppedOutAgents((prev) => new Set(prev).add(agentId));
          dismissChat(agentId);
        });
        chatWin.once("tauri://error", (e) => {
          log.error("Chat window error for", agentId, e);
        });
        chatWin.once("tauri://destroyed", () => {
          log.info("Chat window closed for", agentId);
          setPoppedOutAgents((prev) => {
            const next = new Set(prev);
            next.delete(agentId);
            return next;
          });
        });
      } catch (e) {
        log.error("Failed to pop out chat:", e);
      }
    },
    [dismissChat],
  );

  // Listen for pop-in events from chat windows
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ agentId: string }>("chat-pop-in", (event) => {
        log.info("Pop-in event for", event.payload.agentId);
        setPoppedOutAgents((prev) => {
          const next = new Set(prev);
          next.delete(event.payload.agentId);
          return next;
        });
        // Re-open inline chat
        clickAgent(event.payload.agentId);
      }).then((fn) => { unlisteners.push(fn); });

      // Listen for config changes from pop-out windows
      listen("config-changed", () => {
        log.debug("Config changed from pop-out window");
        saveConfig(themeRef.current, undefined, musicMutedRef.current, dynamicSkyRef.current);
      }).then((fn) => { unlisteners.push(fn); });

      // Reload packages when theme files change on disk
      listen("packages-changed", () => {
        log.info("Package files changed, reloading themes");
        registry.reload().then(() => setThemeVersion((v) => v + 1));
      }).then((fn) => { unlisteners.push(fn); });
    });
    return () => { unlisteners.forEach((fn) => fn()); };
  }, [clickAgent, saveConfig]);

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

  // Find active chat sessions (exclude popped-out agents)
  const activeSessions =
    worldState?.chat_sessions.filter((s) => s.active && !poppedOutAgents.has(s.agent_id)) ?? [];

  if (showSplash) {
    return (
      <div
        className={`splash-screen ${splashFading ? "splash-fade-out" : ""}`}
        onClick={() => splashWaitRef.current && dismissSplash()}
      >
        <div className="splash-logo">
          <span className="splash-emoji">🤖</span>
          <h1 className="splash-title">Agent Terrarium</h1>
          <span className="splash-emoji">✨</span>
        </div>
        <div className="splash-loading">
          {splashWaitRef.current ? (
            <div className="splash-hint">Click to continue</div>
          ) : (
            <div className="splash-dots">
              <span>.</span><span>.</span><span>.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="terrarium-container" onContextMenu={handleContextMenu}>
      <WindowFrame />
      <AnimatedBackground key={themeVersion} theme={theme} dynamicSky={dynamicSky} debugTime={debugTime} debugWeather={debugWeather as import("./weather/types").WeatherOverlay | null} />
      <ThemeMusic theme={theme} muted={musicMuted} onToggleMute={() => {
        setMusicMuted((m) => {
          const next = !m;
          saveConfig(themeRef.current, undefined, next, dynamicSkyRef.current);
          return next;
        });
      }} />
      <WeatherWidget />
      <TerrariumCanvas
        worldState={worldState}
        onAgentClick={handleAgentClick}
        onBallThrow={throwBall}
        onBackgroundClick={handleCanvasClick}
        onMouseUpdate={updateMouse}
        thinkingAgentIds={thinkingAgentIds}
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
            onSend={sendMessageWithThinking}
            onDismiss={handleDismiss}
            onReply={playReplyChirp}
            onConfigure={(agentId) => {
              const a = worldState?.agents.find((ag) => ag.id === agentId);
              if (a) setConfigAgent(a);
            }}
            onPopOut={handlePopOut}
          />
        );
      })}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          agents={worldState?.agents ?? []}
          currentTheme={theme}
          dynamicSky={dynamicSky}
          onClose={() => setContextMenu(null)}
          onThemeChange={setTheme}
          onDynamicSkyToggle={() => {
            setDynamicSky((v) => {
              const next = !v;
              saveConfig(themeRef.current, undefined, musicMutedRef.current, next);
              return next;
            });
          }}
          onAddAgent={async (avatar, name) => {
            await addAgent(avatar, name);
            saveConfig(theme, undefined, musicMutedRef.current, dynamicSkyRef.current);
          }}
          onRemoveAgent={async (agentId) => {
            await removeAgent(agentId);
            saveConfig(theme, undefined, musicMutedRef.current, dynamicSkyRef.current);
          }}
          onSetGear={async (agentId, gearIds) => {
            await setGear(agentId, gearIds);
            playGearSound(agentId);
            saveConfig(theme, undefined, musicMutedRef.current, dynamicSkyRef.current);
          }}
          onToggleDebug={() => setShowDebug((v) => !v)}
          debugOpen={showDebug}
          onAbout={() => setShowAbout(true)}
        />
      )}
      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={async (agentId, name, backendConfig) => {
            await renameAgent(agentId, name);
            await setBackendConfig(agentId, backendConfig);
            saveConfig(theme, undefined, musicMutedRef.current, dynamicSkyRef.current);
            setConfigAgent(null);
          }}
          onClose={() => setConfigAgent(null)}
        />
      )}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showDebug && (
        <DebugPanel
          agents={worldState?.agents ?? []}
          dynamicSky={dynamicSky}
          debugTime={debugTime}
          debugWeather={debugWeather}
          onDebugTime={setDebugTime}
          onDebugWeather={setDebugWeather}
          onRequestAttention={(agentId) => {
            setTimeout(() => requestAttention(agentId), 5000);
          }}
          onClose={() => setShowDebug(false)}
        />
      )}
    </div>
  );
}

export default App;
