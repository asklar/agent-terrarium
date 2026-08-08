import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const APP_DIR = "agent-terrarium";
const PACKAGES_DIR = "packages";

export function getUserPackagesDir(): string {
  return path.join(os.homedir(), APP_DIR, PACKAGES_DIR);
}

export function loadUserPackages(): unknown[] {
  const dir = getUserPackagesDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  const packages: unknown[] = [];
  collectJsonFiles(dir, packages);
  return packages;
}

function collectJsonFiles(dir: string, results: unknown[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        results.push(JSON.parse(content));
      } catch {
        // Skip invalid JSON files
      }
    }
  }
}

export function loadBuiltinPackageFile(filePath: string): unknown {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
