/**
 * Stub for @tauri-apps/api/event — unused in webview but may be
 * transitively imported by shared code.
 */

type UnlistenFn = () => void;

export async function listen(
  _event: string,
  _handler: (event: unknown) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {}
