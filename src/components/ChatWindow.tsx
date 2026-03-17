import { useState, useCallback, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AgentConfigDialog } from "./AgentConfigDialog";
import { CodeBlock } from "./CodeBlock";
import { log } from "../utils/log";
import type { WorldState, ChatSession, Agent } from "../types/world";

const mdComponents = { pre: CodeBlock };

interface ChatWindowProps {
  agentId: string;
}

export function ChatWindow({ agentId }: ChatWindowProps) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [agentName, setAgentName] = useState(agentId);
  const [agentAvatar, setAgentAvatar] = useState("");
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<[string, string][]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agentRef = useRef<Agent | null>(null);

  // Poll world state for this agent's chat session
  useEffect(() => {
    let animFrame = 0;
    const poll = async () => {
      try {
        const state = await invoke<WorldState>("get_world_state");
        const s = state.chat_sessions.find((s) => s.agent_id === agentId);
        if (s) setSession(s);
        const agent = state.agents.find((a) => a.id === agentId);
        if (agent) {
          setAgentName(agent.name);
          setAgentAvatar(agent.avatar);
          agentRef.current = agent;
        }
        // Read pending files from Rust state
        setPendingFiles(state.pending_files[agentId] ?? []);
      } catch (e) {
        log.error("ChatWindow poll error:", e);
      }
      animFrame = requestAnimationFrame(poll);
    };
    animFrame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animFrame);
  }, [agentId]);

  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    const count = session?.messages.length ?? 0;
    if (count !== prevMsgCountRef.current) {
      prevMsgCountRef.current = count;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update window title
  useEffect(() => {
    getCurrentWindow().setTitle(`Chat — ${agentName}`).catch(() => {});
  }, [agentName]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    let text = inputText.trim();
    setInputText("");
    setIsLoading(true);
    try {
      // Rust's send_message reads pending_files and prepends file context automatically
      log.info("ChatWindow send to", agentId, text.slice(0, 80));
      await invoke("send_message", { agentId, text });
    } catch (e) {
      log.error("ChatWindow send error:", e);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [inputText, isLoading, agentId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewSession = useCallback(async () => {
    log.info("New session for", agentId);
    await invoke("clear_chat", { agentId });
  }, [agentId]);

  const handlePopIn = useCallback(async () => {
    log.info("Pop-in chat for", agentId);
    // Emit event so main window knows to pop in
    const { emit } = await import("@tauri-apps/api/event");
    await emit("chat-pop-in", { agentId });
    // Close this window
    await getCurrentWindow().close();
  }, [agentId]);

  const avatarEmoji = agentAvatar === "cat" ? "🐱" : agentAvatar === "copilot" ? "🤖" : agentAvatar === "squirrel" ? "🐿️" : agentAvatar === "penguin" ? "🐧" : agentAvatar === "ghost" ? "👻" : "🤖";

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <span className="chat-window-avatar">{avatarEmoji}</span>
        <span className="chat-window-name">{agentName}</span>
        <button className="chat-window-popin" onClick={handleNewSession} title="New session">
          🔄
        </button>
        <button className="chat-window-popin" onClick={() => { if (agentRef.current) setConfigAgent(agentRef.current); }} title="Configure agent">
          ⚙️
        </button>
        <button className="chat-window-popin" onClick={handlePopIn} title="Pop back into terrarium">
          ⬕
        </button>
      </div>
      <div className="chat-window-messages">
        {session?.messages.map((msg, i) => (
          <div key={i} className={`chat-window-msg ${msg.from_user ? "user" : "agent"}`}>
            {msg.from_user ? msg.text : <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.text}</Markdown>}
          </div>
        )) ?? <div className="chat-window-empty">No messages yet. Say hi!</div>}
        {isLoading && (
          <div className="chat-window-msg agent chat-typing">
            <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {pendingFiles.length > 0 && (
        <div className="chat-pending-files">
          {pendingFiles.map(([name], i) => (
            <span key={i} className="chat-file-pill">
              📎 {name.length > 20 ? name.slice(0, 18) + "…" : name}
              <button className="chat-file-remove" onClick={async () => {
                await invoke("clear_pending_files", { agentId });
              }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="chat-window-input-row">
        <input
          ref={inputRef}
          type="text"
          className="chat-window-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Talk to ${agentName}...`}
          disabled={isLoading}
        />
        <button
          className="chat-window-send"
          onClick={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          ➤
        </button>
      </div>
      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          onSave={async (agentId, name, backendConfig) => {
            await invoke("rename_agent", { agentId, name });
            await invoke("set_backend_config", { agentId, backendConfig });
            // Notify main window to persist config
            const { emit } = await import("@tauri-apps/api/event");
            await emit("config-changed");
            setConfigAgent(null);
          }}
          onClose={() => setConfigAgent(null)}
        />
      )}
    </div>
  );
}
