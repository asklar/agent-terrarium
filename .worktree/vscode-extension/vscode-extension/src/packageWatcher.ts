import * as fs from "node:fs";
import * as path from "node:path";

let watchers: fs.FSWatcher[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

const DEBOUNCE_MS = 500;

function watchRecursive(
  dir: string,
  onChange: () => void,
): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const watcher = fs.watch(dir, { recursive: true }, (_event, _filename) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        onChange();
      }, DEBOUNCE_MS);
    });
    watchers.push(watcher);
  } catch {
    // Fallback: watch top-level dir only (some platforms don't support recursive)
    try {
      const watcher = fs.watch(dir, (_event, _filename) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          onChange();
        }, DEBOUNCE_MS);
      });
      watchers.push(watcher);
    } catch {
      // Unable to watch directory
    }
  }
}

export function startPackageWatcher(dir: string, onChange: () => void): void {
  stopPackageWatcher();
  watchRecursive(dir, onChange);
}

export function stopPackageWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
      // ignore
    }
  }
  watchers = [];
}
