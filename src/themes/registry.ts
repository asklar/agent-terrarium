import type {
  ThemeDefinition,
  AgentDefinition,
  GearDefinition,
  Package,
} from "./PackageTypes";
import { invoke } from "@tauri-apps/api/core";

/** URLs of built-in package JSON files (served from public/) */
const BUILTIN_PACKAGE_URLS = [
  "/packages/themes.json",
  "/packages/agents.json",
  "/packages/gear.json",
  "/packages/seattle/seattle.json",
  "/packages/clippy/clippy.json",
];

/**
 * PackageRegistry manages all loaded themes, agent avatars, and gear.
 * Built-in packages are loaded from JSON files at startup.
 * External packages can be added at runtime.
 */
class PackageRegistry {
  private themes = new Map<string, ThemeDefinition>();
  private agents = new Map<string, AgentDefinition>();
  private gear = new Map<string, GearDefinition>();
  private _ready: Promise<void>;
  private _loaded = false;

  constructor() {
    this._ready = this.loadBuiltins();
  }

  /** Wait until all built-in packages are loaded */
  get ready(): Promise<void> {
    return this._ready;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  private async loadBuiltins() {
    // Load built-in packages from public/
    const results = await Promise.allSettled(
      BUILTIN_PACKAGE_URLS.map((url) =>
        fetch(url).then((r) => r.json() as Promise<Package>)
      )
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        this.loadPackage(result.value);
      } else {
        console.warn("Failed to load built-in package:", result.reason);
      }
    }

    // Load user packages from ~/agent-terrarium/packages/
    try {
      const userJsons = await invoke<string[]>("load_user_packages");
      for (const json of userJsons) {
        try {
          const pkg = JSON.parse(json) as Package;
          this.loadPackage(pkg);
        } catch (e) {
          console.warn("Failed to parse user package:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to load user packages:", e);
    }

    this._loaded = true;
  }

  /** Register all themes, agents, and gear from a package */
  loadPackage(pkg: Package) {
    for (const theme of pkg.themes ?? []) {
      this.themes.set(theme.id, theme);
    }
    for (const agent of pkg.agents ?? []) {
      this.agents.set(agent.id, agent);
    }
    for (const g of pkg.gear ?? []) {
      this.gear.set(g.id, g);
    }
  }

  private _version = 0;

  /** Reload all packages (called when files change on disk) */
  async reload() {
    this._version++;
    this.themes.clear();
    this.agents.clear();
    this.gear.clear();
    await this.loadBuiltins();
    console.info("Packages reloaded");
  }

  /** Cache-bust version, incremented on each reload */
  get version(): number {
    return this._version;
  }

  getTheme(id: string): ThemeDefinition | undefined {
    return this.themes.get(id);
  }

  getAllThemes(): ThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getGear(id: string): GearDefinition | undefined {
    return this.gear.get(id);
  }

  getAllGear(): GearDefinition[] {
    return Array.from(this.gear.values());
  }

  getThemeIds(): string[] {
    return Array.from(this.themes.keys());
  }

  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  getGearIds(): string[] {
    return Array.from(this.gear.keys());
  }
}

/** Singleton registry instance */
export const registry = new PackageRegistry();
