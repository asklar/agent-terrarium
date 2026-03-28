import { useState } from "react";
import { registry } from "../themes";
import type { Agent } from "../types/world";
import type { WeatherOverlay } from "../weather/types";
import { getCachedWeather } from "../weather/weatherService";
import { computeBoundaries } from "../weather/skyCalculator";
import { speakText } from "../audio/tts";
import { invoke } from "@tauri-apps/api/core";

interface DebugPanelProps {
  agents: Agent[];
  dynamicSky: boolean;
  debugTime: number | null;
  debugWeather: string | null;
  onDebugTime: (time: number | null) => void;
  onDebugWeather: (weather: string | null) => void;
  onRequestAttention: (agentId: string) => void;
  onClose: () => void;
}

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

function getTimePresets() {
  const weather = getCachedWeather();
  const today = new Date();
  const defaultSunrise = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 30).getTime();
  const defaultSunset = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0).getTime();
  const sunrise = weather?.sunrise ? new Date(weather.sunrise).getTime() : defaultSunrise;
  const sunset = weather?.sunset ? new Date(weather.sunset).getTime() : defaultSunset;
  const { dawnStart, dawnEnd, noonEnd, duskStart, duskEnd } = computeBoundaries(sunrise, sunset);
  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0).getTime();
  const solarNoon = (sunrise + sunset) / 2;
  return [
    { label: `Night (${fmtTime(duskEnd + 3600000)})`, icon: "🌙", time: duskEnd + 3600000 },
    { label: `Dawn (${fmtTime(dawnStart)})`, icon: "🌅", time: dawnStart },
    { label: `Morning (${fmtTime(dawnEnd)})`, icon: "☀️", time: dawnEnd },
    { label: `Noon (${fmtTime(solarNoon)})`, icon: "🔆", time: solarNoon },
    { label: `Afternoon (${fmtTime(noonEnd)})`, icon: "🌤️", time: noonEnd },
    { label: `Dusk (${fmtTime(duskStart)})`, icon: "🌇", time: duskStart },
    { label: `Evening (${fmtTime(duskEnd)})`, icon: "🌆", time: duskEnd },
    { label: `Midnight (${fmtTime(midnight)})`, icon: "🌑", time: midnight },
  ];
}

export function DebugPanel({
  agents,
  dynamicSky,
  debugTime,
  debugWeather,
  onDebugTime,
  onDebugWeather,
  onRequestAttention,
  onClose,
}: DebugPanelProps) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState({ x: 8, y: 8 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragOffset) setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  };
  const handleMouseUp = () => setDragOffset(null);

  const timePresets = dynamicSky ? getTimePresets() : [];

  return (
    <div
      className="debug-panel"
      style={{ left: pos.x, top: pos.y }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="debug-panel-header" onMouseDown={handleMouseDown}>
        <span>🔧 Debug</span>
        <button className="debug-panel-close" onClick={onClose}>✕</button>
      </div>

      {dynamicSky && (
        <div className="debug-section">
          <div className="debug-section-title">🕐 Time Override</div>
          <div className="debug-chips">
            <button
              className={`debug-chip ${debugTime == null ? "active" : ""}`}
              onClick={() => onDebugTime(null)}
            >
              🔄 Real
            </button>
            {timePresets.map((p, i) => (
              <button
                key={i}
                className={`debug-chip ${debugTime === p.time ? "active" : ""}`}
                onClick={() => onDebugTime(p.time)}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {dynamicSky && (
        <div className="debug-section">
          <div className="debug-section-title">🌦️ Weather Override</div>
          <div className="debug-chips">
            {WEATHER_PRESETS.map((p) => (
              <button
                key={p.value ?? "real"}
                className={`debug-chip ${(debugWeather === p.value || (p.value == null && debugWeather == null)) ? "active" : ""}`}
                onClick={() => onDebugWeather(p.value)}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="debug-section">
        <div className="debug-section-title">🔔 Request Attention</div>
        <div className="debug-chips">
          {agents.length === 0 ? (
            <span className="debug-no-agents">No agents</span>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className={`debug-chip ${a.state === "NeedsAttention" ? "active" : ""}`}
                onClick={() => onRequestAttention(a.id)}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"} {a.name}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="debug-section">
        <div className="debug-section-title">🔊 Test Say (TTS)</div>
        <div className="debug-chips">
          {agents.length === 0 ? (
            <span className="debug-no-agents">No agents</span>
          ) : (
            agents.map((a) => (
              <button
                key={a.id}
                className="debug-chip"
                onClick={() => {
                  const phrases = ["Hello there!", "Nice day!", "Let's play!", "I'm happy!", "Wow cool!"];
                  const text = phrases[Math.floor(Math.random() * phrases.length)];
                  speakText(text, a.avatar);
                  invoke("push_bubble", { agentId: a.id, content: text, isEmoji: false, duration: 10.0 }).catch(() => {});
                }}
              >
                {registry.getAgent(a.avatar)?.icon ?? "❓"} {a.name}
              </button>
            ))
          )}
        </div>
      </div>

      {dynamicSky && (debugTime != null || debugWeather != null) && (
        <div className="debug-section">
          <button
            className="debug-chip debug-reset"
            onClick={() => { onDebugTime(null); onDebugWeather(null); }}
          >
            🔄 Reset All Overrides
          </button>
        </div>
      )}
    </div>
  );
}
