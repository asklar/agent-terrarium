// Shim for @tauri-apps/api/core — redirects invoke() to VS Code postMessage IPC
import { vscodeApi } from "./ipcAdapter";

/**
 * Drop-in replacement for Tauri's `invoke()`.
 * Sends a postMessage to the extension host and waits for a response
 * with a matching `responseId`.
 */
export function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`invoke('${cmd}') timed out after 30s`));
    }, 30_000);

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.responseId === id) {
        window.removeEventListener("message", handler);
        clearTimeout(timeout);
        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.result);
        }
      }
    };

    window.addEventListener("message", handler);
    vscodeApi.postMessage({ command: cmd, ...args, responseId: id });
  });
}
