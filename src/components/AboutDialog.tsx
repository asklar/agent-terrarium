import { openUrl } from "@tauri-apps/plugin-opener";

interface AboutDialogProps {
  onClose: () => void;
}

const VERSION = "0.1.0";

export function AboutDialog({ onClose }: AboutDialogProps) {
  return (
    <div className="agent-config-overlay" onClick={onClose}>
      <div
        className="about-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="about-header">
          <span className="about-icon">🏡</span>
          <span className="about-title">Agent Terrarium</span>
        </div>
        <div className="about-body">
          <p className="about-desc">
            A cozy digital playground where AI agents live, play, and chat.
            Toss a ball, watch them explore, and strike up a conversation!
          </p>
          <p className="about-version">Version {VERSION}</p>
          <p className="about-author">Built by <strong>Alexander Sklar</strong></p>
          <div className="about-links">
            <button
              className="about-link-btn"
              onClick={() => openUrl("https://www.linkedin.com/in/asklar")}
            >
              💼 LinkedIn
            </button>
            <button
              className="about-link-btn"
              onClick={() => openUrl("https://asklar.dev")}
            >
              📝 Blog
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
