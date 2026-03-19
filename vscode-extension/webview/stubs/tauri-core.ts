/**
 * Stub for @tauri-apps/api/core — used by shared src/ modules.
 * In the VS Code webview, Tauri APIs are unavailable. This stub
 * provides a no-op `invoke` so shared code that calls it
 * (registry, AnimatedBackground, weatherService, tts) degrades gracefully.
 */

export async function invoke<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  // load_user_packages expects string[]
  if (cmd === "load_user_packages") return [] as unknown as T;
  // read_user_package_file expects a data-url string
  if (cmd === "read_user_package_file") throw new Error("Not available in VS Code");
  // fetch_location / fetch_weather
  if (cmd === "fetch_location" || cmd === "fetch_weather") throw new Error("Not available in VS Code");
  // tts
  if (cmd === "speak_text") throw new Error("Not available in VS Code");
  // Default: return undefined-ish
  return undefined as unknown as T;
}
