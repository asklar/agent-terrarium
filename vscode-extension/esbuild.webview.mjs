/**
 * esbuild configuration for the VS Code webview bundle.
 *
 * Bundles the React webview entry point along with shared src/ components,
 * replacing Tauri API imports with lightweight stubs.
 *
 * Usage: node esbuild.webview.mjs [--watch]
 */

import * as esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: [path.join(__dirname, "webview", "webviewMain.tsx")],
  bundle: true,
  outfile: path.join(__dirname, "dist", "webview.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  // JSX automatic transform (React 17+)
  jsx: "automatic",
  // Replace Tauri API imports with stubs
  alias: {
    // Ensure all React imports resolve to the same copy (prevent duplicate React)
    "react": path.join(__dirname, "node_modules", "react"),
    "react-dom": path.join(__dirname, "node_modules", "react-dom"),
    "react/jsx-runtime": path.join(__dirname, "node_modules", "react", "jsx-runtime"),
    "react/jsx-dev-runtime": path.join(__dirname, "node_modules", "react", "jsx-dev-runtime"),
    // Replace Tauri API imports with stubs
    "@tauri-apps/api/core": path.join(__dirname, "webview", "stubs", "tauri-core.ts"),
    "@tauri-apps/api/event": path.join(__dirname, "webview", "stubs", "tauri-event.ts"),
    "@tauri-apps/api/window": path.join(__dirname, "webview", "stubs", "tauri-event.ts"),
    "@tauri-apps/api/dpi": path.join(__dirname, "webview", "stubs", "tauri-event.ts"),
    "@tauri-apps/api/webviewWindow": path.join(__dirname, "webview", "stubs", "tauri-event.ts"),
    "@tauri-apps/plugin-opener": path.join(__dirname, "webview", "stubs", "tauri-event.ts"),
  },
  // Define import.meta.env.DEV for the shared log utility
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env": JSON.stringify({ DEV: false }),
  },
  loader: {
    ".ts": "ts",
    ".tsx": "tsx",
    ".css": "css",
  },
  // Minify for production
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(config);
}
