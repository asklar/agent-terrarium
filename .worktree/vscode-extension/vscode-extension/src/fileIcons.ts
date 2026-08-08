const EXTENSION_ICONS: Record<string, string> = {
  ".ts": "📄",
  ".tsx": "📄",
  ".js": "📄",
  ".jsx": "📄",
  ".mjs": "📄",
  ".cjs": "📄",
  ".py": "🐍",
  ".rs": "⚙️",
  ".go": "⚙️",
  ".c": "⚙️",
  ".cpp": "⚙️",
  ".h": "⚙️",
  ".hpp": "⚙️",
  ".cs": "⚙️",
  ".java": "☕",
  ".kt": "☕",
  ".swift": "🍎",
  ".rb": "💎",
  ".php": "🐘",
  ".json": "📋",
  ".yaml": "📋",
  ".yml": "📋",
  ".toml": "📋",
  ".xml": "📋",
  ".html": "🌐",
  ".htm": "🌐",
  ".css": "🎨",
  ".scss": "🎨",
  ".sass": "🎨",
  ".less": "🎨",
  ".svg": "🖼️",
  ".png": "🖼️",
  ".jpg": "🖼️",
  ".jpeg": "🖼️",
  ".gif": "🖼️",
  ".webp": "🖼️",
  ".ico": "🖼️",
  ".bmp": "🖼️",
  ".md": "📝",
  ".mdx": "📝",
  ".txt": "📝",
  ".log": "📝",
  ".csv": "📊",
  ".sql": "🗄️",
  ".db": "🗄️",
  ".sqlite": "🗄️",
  ".sh": "🐚",
  ".bash": "🐚",
  ".zsh": "🐚",
  ".ps1": "🐚",
  ".bat": "🐚",
  ".cmd": "🐚",
  ".dockerfile": "🐳",
  ".lock": "🔒",
  ".env": "🔐",
  ".gitignore": "🙈",
  ".wasm": "🔧",
  ".zip": "📦",
  ".tar": "📦",
  ".gz": "📦",
  ".7z": "📦",
  ".rar": "📦",
  ".pdf": "📕",
  ".doc": "📕",
  ".docx": "📕",
  ".mp3": "🎵",
  ".wav": "🎵",
  ".mp4": "🎬",
  ".mov": "🎬",
  ".avi": "🎬",
};

const FILENAME_ICONS: Record<string, string> = {
  "dockerfile": "🐳",
  "makefile": "🔧",
  "cmakelists.txt": "🔧",
  "cargo.toml": "📦",
  "package.json": "📦",
  "tsconfig.json": "⚙️",
  "readme.md": "📖",
  "license": "📜",
  ".gitignore": "🙈",
  ".env": "🔐",
};

export function getFileIcon(filename: string): string {
  const lower = filename.toLowerCase();

  // Check exact filename matches first
  const nameIcon = FILENAME_ICONS[lower];
  if (nameIcon) {
    return nameIcon;
  }

  // Check extension
  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0) {
    const ext = lower.substring(lastDot);
    const extIcon = EXTENSION_ICONS[ext];
    if (extIcon) {
      return extIcon;
    }
  }

  return "📄";
}

/** Returns an SVG data URL with the emoji rendered as text */
export function getFileIconDataUrl(filename: string): string {
  const emoji = getFileIcon(filename);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="24">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
