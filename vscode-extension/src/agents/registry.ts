import type { AgentBackend } from "./backend.js";

export class BackendRegistry {
  private backends = new Map<string, AgentBackend>();

  register(backend: AgentBackend): void {
    this.backends.set(backend.id(), backend);
  }

  get(id: string): AgentBackend | undefined {
    return this.backends.get(id);
  }

  list(): AgentBackend[] {
    return [...this.backends.values()];
  }
}
