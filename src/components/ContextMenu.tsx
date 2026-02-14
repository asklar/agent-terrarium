import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeName } from "./AnimatedBackground";
import type { Agent } from "../types/world";

interface ContextMenuProps {
  x: number;
  y: number;
  agents: Agent[];
  currentTheme: ThemeName;
  onClose: () => void;
  onThemeChange: (theme: ThemeName) => void;
  onAddAgent: (avatar: string, name: string) => void;
  onRemoveAgent: (agentId: string) => void;
}

const THEMES: { id: ThemeName; label: string; icon: string }[] = [
  { id: "meadow", label: "Meadow", icon: "🌿" },
  { id: "night", label: "Night", icon: "🌙" },
  { id: "desert", label: "Desert", icon: "🏜️" },
  { id: "ocean", label: "Ocean", icon: "🌊" },
  { id: "forest_dawn", label: "Forest at Dawn", icon: "🌅" },
  { id: "castle", label: "Castle", icon: "🏰" },
];

const AVATARS: { id: string; label: string; icon: string }[] = [
  { id: "cat", label: "Cat", icon: "🐱" },
  { id: "copilot", label: "Copilot", icon: "🤖" },
  { id: "squirrel", label: "Squirrel", icon: "🐿️" },
  { id: "penguin", label: "Penguin", icon: "🐧" },
  { id: "ghost", label: "Ghost", icon: "👻" },
];

type SubMenu = null | "theme" | "add" | "remove";

export function ContextMenu({
  x,
  y,
  agents,
  currentTheme,
  onClose,
  onThemeChange,
  onAddAgent,
  onRemoveAgent,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenu, setSubMenu] = useState<SubMenu>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const openSubAfterDelay = useCallback((sub: SubMenu) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setSubMenu(sub), 120);
  }, []);

  const cancelSubOpen = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleTheme = useCallback(
    (theme: ThemeName) => {
      onThemeChange(theme);
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
            onMouseEnter={() => openSubAfterDelay("theme")}
            onMouseLeave={cancelSubOpen}
            onClick={() => setSubMenu("theme")}
          >
            🎨 Theme
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onMouseEnter={() => openSubAfterDelay("add")}
            onMouseLeave={cancelSubOpen}
            onClick={() => setSubMenu("add")}
          >
            ➕ Add Agent
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onMouseEnter={() => openSubAfterDelay("remove")}
            onMouseLeave={cancelSubOpen}
            onClick={() => setSubMenu("remove")}
          >
            ➖ Remove Agent
            <span className="context-menu-arrow">▸</span>
          </button>
        </>
      )}

      {subMenu === "theme" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
            onMouseEnter={cancelSubOpen}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`context-menu-item ${t.id === currentTheme ? "active" : ""}`}
              onClick={() => handleTheme(t.id)}
            >
              {t.icon} {t.label}
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
            onMouseEnter={cancelSubOpen}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          {AVATARS.map((a) => (
            <button
              key={a.id}
              className="context-menu-item"
              onClick={() => handleAdd(a.id, a.label)}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </>
      )}

      {subMenu === "remove" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
            onMouseEnter={cancelSubOpen}
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
                {AVATARS.find((av) => av.id === a.avatar)?.icon ?? "❓"}{" "}
                {a.name}
              </button>
            ))
          )}
        </>
      )}
    </div>
  );
}
