declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

interface WorldState {
  agents: unknown[];
  tick: number;
}

function render(state: WorldState | null) {
  const root = document.getElementById("root");
  if (!root) return;

  if (!state) {
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
        <div style="text-align:center;">
          <h2>🏡 Agent Terrarium</h2>
          <p>Waiting for simulation…</p>
        </div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
      <div style="text-align:center;">
        <h2>🏡 Agent Terrarium</h2>
        <p>Tick: ${state.tick} · Agents: ${state.agents.length}</p>
      </div>
    </div>`;
}

// Initial render
render(null);

// Listen for world state updates from extension host
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "worldState") {
    render(msg.state);
  }
});

// Notify extension host that the webview is ready
vscode.postMessage({ type: "ready" });
