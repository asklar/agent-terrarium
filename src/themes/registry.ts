import type {
  ThemeDefinition,
  AgentDefinition,
  GearDefinition,
  Package,
} from "./PackageTypes";
import { BUILTIN_THEMES, BUILTIN_AGENTS, BUILTIN_GEAR } from "./builtins";

/**
 * PackageRegistry manages all loaded themes, agent avatars, and gear.
 * Built-in packages are always loaded. External packages can be added
 * at runtime (e.g. from ~/agent-terrarium/packages/).
 */
class PackageRegistry {
  private themes = new Map<string, ThemeDefinition>();
  private agents = new Map<string, AgentDefinition>();
  private gear = new Map<string, GearDefinition>();

  constructor() {
    this.loadPackage(BUILTIN_THEMES);
    this.loadPackage(BUILTIN_AGENTS);
    this.loadPackage(BUILTIN_GEAR);
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
