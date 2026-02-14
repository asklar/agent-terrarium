import { useState, useCallback, useEffect, useRef } from "react";
import { registry } from "../themes";
import { setCredential } from "../utils/credentials";
import type { Agent } from "../types/world";

interface BackendConfig {
  backend_id: string;
  model?: string;
  system_prompt?: string;
  custom_agent?: string;
  awareness_level: number;
}

interface AgentConfigDialogProps {
  agent: Agent;
  onSave: (agentId: string, name: string, backendConfig: BackendConfig) => void;
  onClose: () => void;
}

const BACKEND_OPTIONS = [
  { id: "echo", label: "Echo (NPC)" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "openai", label: "OpenAI" },
  { id: "claude", label: "Claude" },
  { id: "openclaw", label: "OpenClaw" },
  { id: "msagent", label: "MS Agent Framework" },
];

const AWARENESS_LEVELS = [
  { value: 0, label: "Chat only" },
  { value: 1, label: "Major events" },
  { value: 2, label: "Social" },
  { value: 3, label: "Full" },
];

export function AgentConfigDialog({ agent, onSave, onClose }: AgentConfigDialogProps) {
  const [name, setName] = useState(agent.name);
  const [backendId, setBackendId] = useState(agent.backend_config?.backend_id ?? "echo");
  const [model, setModel] = useState(agent.backend_config?.model ?? "");
  const [customAgent, setCustomAgent] = useState(agent.backend_config?.custom_agent ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.backend_config?.system_prompt ?? "");
  const [awarenessLevel, setAwarenessLevel] = useState(agent.backend_config?.awareness_level ?? 0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const needsApiKey = !["echo", "copilot"].includes(backendId);
  const agentIcon = registry.getAgent(agent.avatar)?.icon ?? "❓";

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const handleSave = useCallback(() => {
    onSave(agent.id, name, {
      backend_id: backendId,
      model: model || undefined,
      system_prompt: systemPrompt || undefined,
      custom_agent: customAgent || undefined,
      awareness_level: awarenessLevel,
    });
  }, [agent.id, name, backendId, model, systemPrompt, customAgent, awarenessLevel, onSave]);

  const handleSetApiKey = useCallback(() => {
    const label = BACKEND_OPTIONS.find((b) => b.id === backendId)?.label ?? backendId;
    const key = window.prompt(`API key for ${label}:`);
    if (key === null || key === "") return;
    setCredential(backendId, key);
  }, [backendId]);

  return (
    <div className="agent-config-overlay" onMouseDown={handleBackdropClick}>
      <div className="agent-config-dialog" ref={dialogRef}>
        <div className="agent-config-header">
          <span className="agent-config-icon">{agentIcon}</span>
          <input
            className="agent-config-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
          />
        </div>

        <div className="agent-config-body">
          <label className="agent-config-label">
            Backend
            <select
              className="agent-config-select"
              value={backendId}
              onChange={(e) => setBackendId(e.target.value)}
            >
              {BACKEND_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label className="agent-config-label">
            Model
            <input
              className="agent-config-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
            />
          </label>

          <label className="agent-config-label">
            Custom Agent
            <input
              className="agent-config-input"
              value={customAgent}
              onChange={(e) => setCustomAgent(e.target.value)}
              placeholder="my-custom-agent"
            />
          </label>

          <label className="agent-config-label">
            System Prompt
            <textarea
              className="agent-config-textarea"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
            />
          </label>

          <label className="agent-config-label">
            Awareness Level
            <select
              className="agent-config-select"
              value={awarenessLevel}
              onChange={(e) => setAwarenessLevel(Number(e.target.value))}
            >
              {AWARENESS_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.value} — {l.label}
                </option>
              ))}
            </select>
          </label>

          {needsApiKey && (
            <button className="agent-config-api-key-btn" onClick={handleSetApiKey}>
              🔑 Set API Key
            </button>
          )}
        </div>

        <div className="agent-config-footer">
          <button className="agent-config-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="agent-config-save-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
