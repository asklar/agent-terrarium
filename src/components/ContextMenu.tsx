import { useCallback, useEffect, useRef, useState } from "react";
import { registry } from "../themes";
import type { GearSlot } from "../themes/PackageTypes";
import type { Agent } from "../types/world";

interface BackendOption {
  id: string;
  label: string;
}

const BACKEND_OPTIONS: BackendOption[] = [
  { id: "echo", label: "Echo (NPC)" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "claude", label: "Claude" },
  { id: "openclaw", label: "OpenClaw" },
  { id: "msagent", label: "Microsoft Agent Framework" },
];

interface ContextMenuProps {
  x: number;
  y: number;
  agents: Agent[];
  currentTheme: string;
  onClose: () => void;
  onThemeChange: (theme: string) => void;
  onAddAgent: (avatar: string, name: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSetGear: (agentId: string, gearIds: string[]) => void;
  onRequestAttention: (agentId: string) => void;
  onSetBackend: (agentId: string, backendConfig: { backend_id: string; model?: string; system_prompt?: string; custom_agent?: string; awareness_level?: number }) => void;
}

type SubMenu = null | "theme" | "add" | "remove" | "gear" | "gear-agent" | "gear-slot" | "attention" | "backend" | "backend-agent";

export function ContextMenu({
  x,
  y,
  agents,
  currentTheme,
  onClose,
  onThemeChange,
  onAddAgent,
  onRemoveAgent,
  onSetGear,
  onRequestAttention,
  onSetBackend,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GearSlot | null>(null);
  const readyRef = useRef(false);

  // Ignore clicks for a brief moment after menu appears
  // to prevent the right-click mouseup from triggering a menu item
  useEffect(() => {
    readyRef.current = false;
    const timer = setTimeout(() => {
      readyRef.current = true;
    }, 200);
    return () => clearTimeout(timer);
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (subMenu) setSubMenu(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose, subMenu]);

  const guardedClick = useCallback(
    <T extends unknown[]>(fn: (...args: T) => void) =>
      (...args: T) => {
        if (readyRef.current) fn(...args);
      },
    [],
  );

  const handleTheme = useCallback(
    (themeId: string) => {
      onThemeChange(themeId);
      onClose();
    },
    [onThemeChange, onClose],
  );

  const handleAdd = useCallback(
    (avatar: string, label: string) => {
      onAddAgent(avatar, label);
      onClose();
    },
    [onAddAgent, onClose],
  );

  const handleRemove = useCallback(
    (agentId: string) => {
      onRemoveAgent(agentId);
      onClose();
    },
    [onRemoveAgent, onClose],
  );

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setSubMenu("gear-agent");
  }, []);

  const handleSelectSlot = useCallback((slot: GearSlot) => {
    setSelectedSlot(slot);
    setSubMenu("gear-slot");
  }, []);

  const handleToggleGear = useCallback(
    (gearId: string) => {
      if (!selectedAgentId) return;
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (!agent) return;
      const current = agent.gear ?? [];
      const next = current.includes(gearId)
        ? current.filter((g) => g !== gearId)
        : [...current, gearId];
      onSetGear(selectedAgentId, next);
    },
    [selectedAgentId, agents, onSetGear],
  );

  const handleRequestAttention = useCallback(
    (agentId: string) => {
      onRequestAttention(agentId);
      onClose();
    },
    [onRequestAttention, onClose],
  );

  const handleSelectBackendAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setSubMenu("backend-agent");
  }, []);

  const handleSetBackend = useCallback(
    (backendId: string) => {
      if (!selectedAgentId) return;
      const agent = agents.find((a) => a.id === selectedAgentId);
      const existing = agent?.backend_config;
      onSetBackend(selectedAgentId, {
        backend_id: backendId,
        model: existing?.model,
        system_prompt: existing?.system_prompt,
        custom_agent: existing?.custom_agent,
        awareness_level: existing?.awareness_level ?? 0,
      });
    },
    [selectedAgentId, agents, onSetBackend],
  );

  const handleSetPrompt = useCallback(() => {
    if (!selectedAgentId) return;
    const agent = agents.find((a) => a.id === selectedAgentId);
    const current = agent?.backend_config?.system_prompt ?? "";
    const prompt = window.prompt("System prompt for " + (agent?.name ?? "agent") + ":", current);
    if (prompt === null) return; // cancelled
    const existing = agent?.backend_config;
    onSetBackend(selectedAgentId, {
      backend_id: existing?.backend_id ?? "echo",
      model: existing?.model,
      system_prompt: prompt || undefined,
      custom_agent: existing?.custom_agent,
      awareness_level: existing?.awareness_level ?? 0,
    });
  }, [selectedAgentId, agents, onSetBackend]);

  const GEAR_SLOTS: { slot: GearSlot; icon: string; label: string }[] = [
    { slot: "hat", icon: "🎩", label: "Hat" },
    { slot: "face", icon: "🕶️", label: "Face" },
    { slot: "neck", icon: "🧣", label: "Neck" },
    { slot: "body", icon: "🧥", label: "Body" },
    { slot: "back", icon: "🦸", label: "Back" },
  ];

  // Keep menu within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 260),
    zIndex: 1000,
  };

  return (
    <div className="context-menu" style={menuStyle} ref={menuRef}>
      {subMenu === null && (
        <>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("theme"))}
          >
            🎨 Theme
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("add"))}
          >
            ➕ Add Agent
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("remove"))}
          >
            ➖ Remove Agent
            <span className="context-menu-arrow">▸</span>
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("gear"))}
          >
            👒 Gear
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("backend"))}
          >
            🤖 Backend
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("attention"))}
          >
            🔔 Request Attention
            <span className="context-menu-arrow">▸</span>
          </button>
        </>
      )}

      {subMenu === "theme" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {registry.getAllThemes().map((t) => (
            <button
              key={t.id}
              className={`context-menu-item ${t.id === currentTheme ? "active" : ""}`}
              onClick={() => handleTheme(t.id)}
            >
              {t.icon} {t.name}
              {t.id === currentTheme && (
                <span className="context-menu-check">✓</span>
              )}
            </button>
          ))}
        </>
      )}

      {subMenu === "add" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {registry.getAllAgents().map((a) => (
            <button
              key={a.id}
              className="context-menu-item"
              onClick={() => handleAdd(a.id, a.name)}
            >
              {a.icon} {a.name}
            </button>
          ))}
        </>
      )}

      {subMenu === "remove" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {agents.length === 0 ? (
            <div className="context-menu-item disabled">No agents</div>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className="context-menu-item"
                onClick={() => handleRemove(a.id)}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"}{" "}
                {a.name}
              </button>
            ))
          )}
        </>
      )}
      {subMenu === "gear" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {agents.length === 0 ? (
            <div className="context-menu-item disabled">No agents</div>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className="context-menu-item"
                onClick={() => handleSelectAgent(a.id)}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"} {a.name}
                {(a.gear?.length ?? 0) > 0 && (
                  <span className="context-menu-check">
                    {a.gear.map((g) => registry.getGear(g)?.icon ?? "").join("")}
                  </span>
                )}
                <span className="context-menu-arrow">▸</span>
              </button>
            ))
          )}
        </>
      )}

      {subMenu === "gear-agent" && selectedAgentId && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu("gear")}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {GEAR_SLOTS.map(({ slot, icon, label }) => {
            const agent = agents.find((a) => a.id === selectedAgentId);
            const equipped = (agent?.gear ?? [])
              .map((g) => registry.getGear(g))
              .filter((g) => g?.slot === slot);
            return (
              <button
                key={slot}
                className="context-menu-item"
                onClick={() => handleSelectSlot(slot)}
              >
                {icon} {label}
                {equipped.length > 0 && (
                  <span className="context-menu-check">
                    {equipped.map((g) => g?.icon ?? "").join("")}
                  </span>
                )}
                <span className="context-menu-arrow">▸</span>
              </button>
            );
          })}
        </>
      )}

      {subMenu === "gear-slot" && selectedAgentId && selectedSlot && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu("gear-agent")}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {registry
            .getAllGear()
            .filter((g) => g.slot === selectedSlot)
            .map((g) => {
              const agent = agents.find((a) => a.id === selectedAgentId);
              const isEquipped = (agent?.gear ?? []).includes(g.id);
              return (
                <button
                  key={g.id}
                  className={`context-menu-item ${isEquipped ? "active" : ""}`}
                  onClick={() => handleToggleGear(g.id)}
                >
                  {g.icon} {g.name}
                  {isEquipped && (
                    <span className="context-menu-check">✓</span>
                  )}
                </button>
              );
            })}
        </>
      )}
      {subMenu === "attention" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {agents.length === 0 ? (
            <div className="context-menu-item disabled">No agents</div>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className="context-menu-item"
                onClick={() => handleRequestAttention(a.id)}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"} {a.name}
                {a.state === "NeedsAttention" && (
                  <span className="context-menu-check">🔔</span>
                )}
              </button>
            ))
          )}
        </>
      )}
      {subMenu === "backend" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {agents.length === 0 ? (
            <div className="context-menu-item disabled">No agents</div>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className="context-menu-item"
                onClick={() => handleSelectBackendAgent(a.id)}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"} {a.name}
                <span className="context-menu-check">
                  {BACKEND_OPTIONS.find((b) => b.id === (a.backend_config?.backend_id ?? "echo"))?.label ?? "Echo (NPC)"}
                </span>
                <span className="context-menu-arrow">▸</span>
              </button>
            ))
          )}
        </>
      )}
      {subMenu === "backend-agent" && selectedAgentId && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu("backend")}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {BACKEND_OPTIONS.map((b) => {
            const agent = agents.find((a) => a.id === selectedAgentId);
            const currentBackend = agent?.backend_config?.backend_id ?? "echo";
            const isActive = currentBackend === b.id;
            return (
              <button
                key={b.id}
                className={`context-menu-item ${isActive ? "active" : ""}`}
                onClick={() => handleSetBackend(b.id)}
              >
                {b.label}
                {isActive && (
                  <span className="context-menu-check">✓</span>
                )}
              </button>
            );
          })}
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={handleSetPrompt}
          >
            💬 Set Prompt...
          </button>
        </>
      )}
    </div>
  );
}
