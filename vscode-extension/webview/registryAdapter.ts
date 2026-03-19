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

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let initialized = false;

/**
 * Initialize the registry adapter. Call once at startup.
 * Requests package data from the extension host and loads it
 * into the shared registry singleton.
 */
export function initRegistryAdapter(vscode: ReturnType<typeof acquireVsCodeApi>): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "packages") {
      const packages = msg.packages as (Package | string)[];
      for (const pkg of packages) {
        try {
          const parsed: Package = typeof pkg === "string" ? JSON.parse(pkg) : pkg;
          registry.loadPackage(parsed);
        } catch (e) {
          console.warn("Failed to load package in webview:", e);
        }
      }
    }

    if (msg.type === "loadUserPackagesResult") {
      const packages = msg.packages as string[];
      for (const json of packages) {
        try {
          const pkg = JSON.parse(json) as Package;
          registry.loadPackage(pkg);
        } catch (e) {
          console.warn("Failed to load user package in webview:", e);
        }
      }
    }
  });

  // Request packages from the extension host
  vscode.postMessage({ type: "loadUserPackages" });
}

export { registry };
