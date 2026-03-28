import { useCallback, useEffect, useRef, useState } from "react";
import { registry } from "../themes";
import type { GearSlot } from "../themes/PackageTypes";
import type { Agent } from "../types/world";

interface ContextMenuProps {
  x: number;
  y: number;
  agents: Agent[];
  currentTheme: string;
  dynamicSky: boolean;
  onClose: () => void;
  onThemeChange: (theme: string) => void;
  onDynamicSkyToggle: () => void;
  onAddAgent: (avatar: string, name: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSetGear: (agentId: string, gearIds: string[]) => void;
  onToggleDebug: () => void;
  debugOpen: boolean;
  onAbout: () => void;
}

type SubMenu = null | "theme" | "add" | "add-npc" | "remove" | "gear" | "gear-agent" | "gear-slot";

export function ContextMenu({
  x,
  y,
  agents,
  currentTheme,
  dynamicSky,
  onClose,
  onThemeChange,
  onDynamicSkyToggle,
  onAddAgent,
  onRemoveAgent,
  onSetGear,
  onToggleDebug,
  debugOpen,
  onAbout,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GearSlot | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
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

  // Keyboard navigation
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (subMenu) setSubMenu(null);
        else onClose();
        return;
      }

      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        ".context-menu-item:not(.disabled)"
      );
      if (!items || items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => {
          const next = Math.min(prev + 1, items.length - 1);
          items[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          items[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter" && focusIndex >= 0 && focusIndex < items.length) {
        e.preventDefault();
        items[focusIndex]?.click();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose, subMenu, focusIndex]);

  // Reset focus when submenu changes
  useEffect(() => {
    setFocusIndex(-1);
  }, [subMenu]);

  // Apply focused class to the active item
  useEffect(() => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      ".context-menu-item:not(.disabled)"
    );
    items?.forEach((item, i) => {
      item.classList.toggle("focused", i === focusIndex);
    });
  }, [focusIndex, subMenu, selectedAgentId, selectedSlot]);

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
    top: y,
    maxHeight: `${window.innerHeight - y - 10}px`,
    zIndex: 1000,
  };

  // If menu would go below viewport, grow upward instead
  if (y > window.innerHeight * 0.6) {
    menuStyle.top = undefined as unknown as number;
    menuStyle.bottom = window.innerHeight - y;
    menuStyle.maxHeight = `${y - 10}px`;
  }

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
            onClick={guardedClick(() => {
              onToggleDebug();
              onClose();
            })}
          >
            🔧 Debug
            {debugOpen && <span className="context-menu-check">✓</span>}
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={guardedClick(() => {
              onAbout();
              onClose();
            })}
          >
            ℹ️ About
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
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={guardedClick(() => {
              onDynamicSkyToggle();
            })}
          >
            🌤️ Dynamic Sky
            {dynamicSky && <span className="context-menu-check">✓</span>}
          </button>
        </>
      )}

      {subMenu === "add" && (() => {
        const allAgents = registry.getAllAgents();
        const liveAgents = allAgents.filter((a) => a.defaultBackend);
        const hasNpcs = allAgents.some((a) => !a.defaultBackend);
        return (
          <>
            <button
              className="context-menu-item context-menu-back"
              onClick={() => setSubMenu(null)}
            >
              ◂ Back
            </button>
            <div className="context-menu-divider" />
            {liveAgents.map((a) => (
              <button
                key={a.id}
                className="context-menu-item"
                onClick={() => handleAdd(a.id, a.name)}
              >
                {a.icon} {a.name}
              </button>
            ))}
            {hasNpcs && (
              <>
                <div className="context-menu-divider" />
                <button
                  className="context-menu-item"
                  onClick={guardedClick(() => setSubMenu("add-npc"))}
                >
                  🤖 Add NPC
                  <span className="context-menu-arrow">▸</span>
                </button>
              </>
            )}
          </>
        );
      })()}

      {subMenu === "add-npc" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu("add")}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {registry.getAllAgents().filter((a) => !a.defaultBackend).map((a) => (
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
    </div>
  );
}
