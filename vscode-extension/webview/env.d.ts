/** Type declarations for the VS Code webview environment */

// Shim for Vite's import.meta.env (used by shared src/utils/log.ts)
interface ImportMeta {
  readonly env: {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
    [key: string]: unknown;
  };
}
