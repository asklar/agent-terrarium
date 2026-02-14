import { useCallback, useEffect, useRef, useState } from "react";
import { registry } from "../themes";
import type { GearSlot } from "../themes/PackageTypes";
import type { Agent } from "../types/world";

import type { WeatherOverlay } from "../weather/types";

interface ContextMenuProps {
  x: number;
  y: number;
  agents: Agent[];
  currentTheme: string;
  dynamicSky: boolean;
  debugTime: number | null;
  debugWeather: string | null;
  onClose: () => void;
  onThemeChange: (theme: string) => void;
  onDynamicSkyToggle: () => void;
  onDebugTime: (time: number | null) => void;
  onDebugWeather: (weather: string | null) => void;
  onAddAgent: (avatar: string, name: string) => void;
  onRemoveAgent: (agentId: string) => void;
  onSetGear: (agentId: string, gearIds: string[]) => void;
  onRequestAttention: (agentId: string) => void;
}

type SubMenu = null | "theme" | "add" | "remove" | "gear" | "gear-agent" | "gear-slot" | "attention" | "debug" | "debug-time" | "debug-weather";

export function ContextMenu({
  x,
  y,
  agents,
  currentTheme,
  dynamicSky,
  debugTime,
  debugWeather,
  onClose,
  onThemeChange,
  onDynamicSkyToggle,
  onDebugTime,
  onDebugWeather,
  onAddAgent,
  onRemoveAgent,
  onSetGear,
  onRequestAttention,
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
            onClick={guardedClick(() => setSubMenu("attention"))}
          >
            🔔 Request Attention
            <span className="context-menu-arrow">▸</span>
          </button>
          {dynamicSky && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-item"
                onClick={guardedClick(() => setSubMenu("debug"))}
              >
                🔧 Debug Sky
                {(debugTime != null || debugWeather != null) && <span className="context-menu-check">⚡</span>}
                <span className="context-menu-arrow">▸</span>
              </button>
            </>
          )}
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
      {subMenu === "debug" && (
        <>
          <button
            className="context-menu-item context-menu-back"
            onClick={() => setSubMenu(null)}
          >
            ◂ Back
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("debug-time"))}
          >
            🕐 Time Override
            {debugTime != null && <span className="context-menu-check">⚡</span>}
            <span className="context-menu-arrow">▸</span>
          </button>
          <button
            className="context-menu-item"
            onClick={guardedClick(() => setSubMenu("debug-weather"))}
          >
            🌦️ Weather Override
            {debugWeather != null && <span className="context-menu-check">⚡</span>}
            <span className="context-menu-arrow">▸</span>
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={guardedClick(() => {
              onDebugTime(null);
              onDebugWeather(null);
              onClose();
            })}
          >
            🔄 Reset All
          </button>
        </>
      )}
      {subMenu === "debug-time" && (() => {
        const makeTime = (hour: number) => {
          const d = new Date();
          d.setHours(hour, 0, 0, 0);
          return d.getTime();
        };
        const TIME_PRESETS: { label: string; icon: string; hour: number }[] = [
          { label: "Night (2 AM)", icon: "🌙", hour: 2 },
          { label: "Dawn (6 AM)", icon: "🌅", hour: 6 },
          { label: "Morning (9 AM)", icon: "☀️", hour: 9 },
          { label: "Noon (12 PM)", icon: "🔆", hour: 12 },
          { label: "Afternoon (3 PM)", icon: "🌤️", hour: 15 },
          { label: "Dusk (6 PM)", icon: "🌇", hour: 18 },
          { label: "Evening (9 PM)", icon: "🌆", hour: 21 },
          { label: "Midnight", icon: "🌑", hour: 0 },
        ];
        return (
          <>
            <button
              className="context-menu-item context-menu-back"
              onClick={() => setSubMenu("debug")}
            >
              ◂ Back
            </button>
            <div className="context-menu-divider" />
            <button
              className={`context-menu-item ${debugTime == null ? "active" : ""}`}
              onClick={guardedClick(() => {
                onDebugTime(null);
                onClose();
              })}
            >
              🔄 Real Time
              {debugTime == null && <span className="context-menu-check">✓</span>}
            </button>
            {TIME_PRESETS.map((p) => (
              <button
                key={p.hour}
                className={`context-menu-item ${debugTime === makeTime(p.hour) ? "active" : ""}`}
                onClick={guardedClick(() => {
                  onDebugTime(makeTime(p.hour));
                  onClose();
                })}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </>
        );
      })()}
      {subMenu === "debug-weather" && (() => {
        const WEATHER_PRESETS: { label: string; icon: string; value: WeatherOverlay | null }[] = [
          { label: "Real Weather", icon: "🔄", value: null },
          { label: "Clear", icon: "☀️", value: "none" },
          { label: "Cloudy", icon: "☁️", value: "cloudy" },
          { label: "Fog", icon: "🌫️", value: "fog" },
          { label: "Drizzle", icon: "🌦️", value: "drizzle" },
          { label: "Rain", icon: "🌧️", value: "rain" },
          { label: "Snow", icon: "🌨️", value: "snow" },
          { label: "Storm", icon: "⛈️", value: "storm" },
        ];
        return (
          <>
            <button
              className="context-menu-item context-menu-back"
              onClick={() => setSubMenu("debug")}
            >
              ◂ Back
            </button>
            <div className="context-menu-divider" />
            {WEATHER_PRESETS.map((p) => (
              <button
                key={p.value ?? "real"}
                className={`context-menu-item ${debugWeather === p.value ? "active" : (p.value == null && debugWeather == null) ? "active" : ""}`}
                onClick={guardedClick(() => {
                  onDebugWeather(p.value);
                  onClose();
                })}
              >
                {p.icon} {p.label}
                {(debugWeather === p.value || (p.value == null && debugWeather == null)) && <span className="context-menu-check">✓</span>}
              </button>
            ))}
          </>
        );
      })()}
    </div>
  );
}
