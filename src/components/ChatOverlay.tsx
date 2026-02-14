import { useState, useCallback, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatSession } from "../types/world";

interface ChatOverlayProps {
  session: ChatSession;
  agentPosition: { x: number; y: number };
  agentName: string;
  onSend: (agentId: string, text: string) => Promise<string>;
  onDismiss: (agentId: string) => void;
  onReply?: (agentId: string) => void;
  onConfigure?: (agentId: string) => void;
  onPopOut?: (agentId: string) => void;
}

export function ChatOverlay({
  session,
  agentPosition,
  agentName,
  onSend,
  onDismiss,
  onReply,
  onConfigure,
  onPopOut,
}: ChatOverlayProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef(session.messages.length);

  useEffect(() => {
    if (session.messages.length !== prevMsgCountRef.current) {
      prevMsgCountRef.current = session.messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [session.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    setInputText("");
    setIsLoading(true);
    try {
      await onSend(session.agent_id, text);
      onReply?.(session.agent_id);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [inputText, isLoading, onSend, session.agent_id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        onDismiss(session.agent_id);
      }
    },
    [handleSend, onDismiss, session.agent_id],
  );

  // Position the chat bubble near the agent
  const style: React.CSSProperties = {
    position: "absolute",
    left: Math.max(10, Math.min(agentPosition.x - 120, window.innerWidth - 260)),
    top: Math.max(10, agentPosition.y - 200),
    width: 240,
    maxHeight: 200,
  };

  return (
    <div
      className="chat-overlay"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="chat-header">
        <span className="chat-agent-name">{agentName}</span>
        {onConfigure && (
          <button
            className="chat-configure"
            onClick={() => onConfigure(session.agent_id)}
            title="Configure agent"
          >
            ⚙️
          </button>
        )}
        {onPopOut && (
          <button
            className="chat-configure"
            onClick={() => onPopOut(session.agent_id)}
            title="Pop out chat"
          >
            ⬗
          </button>
        )}
        <button
          className="chat-close"
          onClick={() => onDismiss(session.agent_id)}
        >
          ✕
        </button>
      </div>
      <div className="chat-messages">
        {session.messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-message ${msg.from_user ? "user" : "agent"}`}
          >
            {msg.from_user ? msg.text : <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-row">
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Talk to ${agentName}...`}
          disabled={isLoading}
        />
        <button
          className="chat-send"
          onClick={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
