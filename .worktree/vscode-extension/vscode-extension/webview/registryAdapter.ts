/**
 * Package registry adapter for VS Code webview.
 *
 * The shared PackageRegistry (src/themes/registry.ts) tries to fetch()
 * built-in packages from /packages/*.json, which won't work in a VS Code
 * webview. Instead, the extension host loads package JSON data and pushes
 * it via postMessage.
 *
 * This module:
 * 1. Waits for the shared registry to finish its (failed) init
 * 2. Listens for "packages" messages from the extension host
 * 3. Loads received packages into the shared registry
 */

import { registry } from "../../src/themes/registry";
import type { Package } from "../../src/themes/PackageTypes";

let initialized = false;

/**
 * Initialize the registry adapter. Call once at startup.
 * Requests package data from the extension host and loads it
 * into the shared registry singleton.
 */
export function initRegistryAdapter(vscode: { postMessage(msg: unknown): void }): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "packages" || msg.type === "loadUserPackagesResult") {
      const packages = msg.packages as unknown[];
      let loaded = 0;
      for (const pkg of packages) {
        try {
          let parsed: Package;
          if (typeof pkg === "string") {
            parsed = JSON.parse(pkg);
          } else if (pkg && typeof pkg === "object") {
            parsed = pkg as Package;
          } else {
            continue;
          }
          registry.loadPackage(parsed);
          loaded++;
        } catch (e) {
          console.warn("Failed to load package in webview:", e);
        }
      }
      console.log(`[AT] Loaded ${loaded}/${packages.length} packages from ${msg.type}`);
    }
  });

  // Request packages from the extension host
  vscode.postMessage({ type: "loadUserPackages" });
}

export { registry };
