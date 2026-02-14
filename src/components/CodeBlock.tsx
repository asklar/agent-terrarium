import { useState, useCallback, useRef } from "react";
import type { HTMLAttributes, ClassAttributes } from "react";

type CodeBlockProps = ClassAttributes<HTMLPreElement> &
  HTMLAttributes<HTMLPreElement> & {
    node?: unknown;
  };

export function CodeBlock({ children, node: _node, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select text
    }
  }, []);

  return (
    <div className="code-block-wrapper">
      <pre ref={preRef} {...props}>{children}</pre>
      <button
        className={`code-copy-btn ${copied ? "copied" : ""}`}
        onClick={handleCopy}
        title="Copy to clipboard"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}
