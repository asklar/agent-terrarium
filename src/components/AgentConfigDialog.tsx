import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { registry } from "../themes";
import { setCredential } from "../utils/credentials";
import type { Agent } from "../types/world";

interface BackendConfig {
  backend_id: string;
  model?: string;
  awareness_model?: string;
  system_prompt?: string;
  custom_agent?: string;
  awareness_level: number;
  tts_enabled?: boolean;
  cwd?: string;
}

interface ModelOption {
  id: string;
  name: string;
}

interface AgentOption {
  name: string;
  source: string;
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
  { id: "claude", label: "Claude", disabled: true },
  { id: "openclaw", label: "OpenClaw", disabled: true },
  { id: "msagent", label: "Microsoft Agent Framework", disabled: true },
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
  const [awarenessModel, setAwarenessModel] = useState(agent.backend_config?.awareness_model ?? "");
  const [ttsEnabled, setTtsEnabled] = useState(agent.backend_config?.tts_enabled ?? false);
  const [cwd, setCwd] = useState(agent.backend_config?.cwd ?? "");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const needsApiKey = !["echo", "copilot"].includes(backendId);
  const agentIcon = registry.getAgent(agent.avatar)?.icon ?? "❓";

  // Fetch available models when backend changes
  useEffect(() => {
    setModelOptions([]);
    if (backendId === "echo") return;
    let cancelled = false;
    setLoadingModels(true);
    invoke<ModelOption[]>("list_backend_models", { backendId })
      .then((models) => {
        if (!cancelled) setModelOptions(models);
      })
      .catch(() => {
        // Backend may not support listing models — that's fine
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => { cancelled = true; };
  }, [backendId]);

  // Fetch available custom agents when backend or cwd changes
  useEffect(() => {
    setAgentOptions([]);
    if (backendId === "echo") return;
    let cancelled = false;
    invoke<AgentOption[]>("list_backend_agents", { backendId, cwd: cwd || null })
      .then((agents) => {
        if (!cancelled) setAgentOptions(agents);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [backendId, cwd]);

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
      awareness_model: awarenessModel || undefined,
      system_prompt: systemPrompt || undefined,
      custom_agent: customAgent || undefined,
      awareness_level: awarenessLevel,
      tts_enabled: ttsEnabled,
      cwd: cwd || undefined,
    });
  }, [agent.id, name, backendId, model, awarenessModel, systemPrompt, customAgent, awarenessLevel, ttsEnabled, cwd, onSave]);

  const handleBrowseFolder = useCallback(async () => {
    const folder = await invoke<string | null>("pick_folder");
    if (folder) setCwd(folder);
  }, []);

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
                <option key={b.id} value={b.id} disabled={b.disabled}>
                  {b.label}{b.disabled ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="agent-config-label">
            Model
            <select
              className="agent-config-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">Use default</option>
              {model && !modelOptions.some((m) => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {loadingModels && <span className="agent-config-hint">Loading models…</span>}
          </label>

          <label className="agent-config-label">
            Custom Agent
            <select
              className="agent-config-select"
              value={customAgent}
              onChange={(e) => setCustomAgent(e.target.value)}
            >
              <option value="">None</option>
              {customAgent && !agentOptions.some((a) => a.name === customAgent) && (
                <option value={customAgent}>{customAgent}</option>
              )}
              {agentOptions.map((a) => (
                <option key={`${a.source}:${a.name}`} value={a.name}>
                  {a.name} ({a.source})
                </option>
              ))}
            </select>
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

          {awarenessLevel > 0 && backendId !== "echo" && (
            <label className="agent-config-label">
              Awareness Model
              <select
                className="agent-config-select"
                value={awarenessModel}
                onChange={(e) => setAwarenessModel(e.target.value)}
              >
                <option value="">Default (fast)</option>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="agent-config-label">
            Working Folder
            <div className="agent-config-folder-row">
              <input
                className="agent-config-input agent-config-folder-input"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="No folder selected"
                readOnly
              />
              <button className="agent-config-browse-btn" onClick={handleBrowseFolder} type="button">
                📂
              </button>
              {cwd && (
                <button className="agent-config-browse-btn" onClick={() => setCwd("")} type="button" title="Clear">
                  ✕
                </button>
              )}
            </div>
          </label>

          {awarenessLevel > 0 && (
            <label className="agent-config-label agent-config-checkbox-label">
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => setTtsEnabled(e.target.checked)}
              />
              🔊 Speak say actions (TTS)
            </label>
          )}

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
