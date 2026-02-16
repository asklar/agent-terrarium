import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * Vite plugin that serves root-level packages/ directory at /packages/ URL,
 * as a fallback after public/packages/. This lets theme packages (e.g.
 * packages/seattle/) live outside public/ while still being accessible via
 * the same URL namespace.
 */
function serveRootPackages(): Plugin {
  const packagesDir = path.resolve(__dirname, "packages");
  return {
    name: "serve-root-packages",
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/packages/")) return next();
          const rel = decodeURIComponent(req.url.slice("/packages/".length));
          const file = path.join(packagesDir, rel);
          if (!file.startsWith(packagesDir)) return next();
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
          const ext = path.extname(file);
          const mime: Record<string, string> = {
            ".json": "application/json",
            ".svg": "image/svg+xml",
          };
          res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
          fs.createReadStream(file).pipe(res);
        });
      };
    },
    writeBundle(options) {
      const outDir = options.dir || "dist";
      const dest = path.join(outDir, "packages");
      for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // Skip npm workspace packages (e.g. packages/claude/)
        if (fs.existsSync(path.join(packagesDir, entry.name, "package.json"))) continue;
        const src = path.join(packagesDir, entry.name);
        const target = path.join(dest, entry.name);
        fs.mkdirSync(target, { recursive: true });
        for (const f of fs.readdirSync(src, { withFileTypes: true })) {
          if (!f.isFile()) continue;
          fs.copyFileSync(path.join(src, f.name), path.join(target, f.name));
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), serveRootPackages()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
