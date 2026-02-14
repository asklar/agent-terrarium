import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

const EDGE = 6;

const resizeHandles: {
  direction: ResizeDirection;
  style: React.CSSProperties;
  cursor: string;
}[] = [
  // Edges
  {
    direction: "North",
    cursor: "ns-resize",
    style: { top: 0, left: EDGE, right: EDGE, height: EDGE },
  },
  {
    direction: "South",
    cursor: "ns-resize",
    style: { bottom: 0, left: EDGE, right: EDGE, height: EDGE },
  },
  {
    direction: "West",
    cursor: "ew-resize",
    style: { left: 0, top: EDGE, bottom: EDGE, width: EDGE },
  },
  {
    direction: "East",
    cursor: "ew-resize",
    style: { right: 0, top: EDGE, bottom: EDGE, width: EDGE },
  },
  // Corners
  {
    direction: "NorthWest",
    cursor: "nwse-resize",
    style: { top: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },
  },
  {
    direction: "NorthEast",
    cursor: "nesw-resize",
    style: { top: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },
  },
  {
    direction: "SouthWest",
    cursor: "nesw-resize",
    style: { bottom: 0, left: 0, width: EDGE * 2, height: EDGE * 2 },
  },
  {
    direction: "SouthEast",
    cursor: "nwse-resize",
    style: { bottom: 0, right: 0, width: EDGE * 2, height: EDGE * 2 },
  },
];

export function WindowFrame() {
  const startResize = useCallback((direction: ResizeDirection) => {
    getCurrentWindow().startResizeDragging(direction);
  }, []);

  return (
    <>
      {/* Drag region — thin bar at the top of the window */}
      <div
        className="drag-region"
        data-tauri-drag-region
      >
        <span className="drag-label" data-tauri-drag-region>
          🌿 Agent Terrarium
        </span>
        <button
          className="titlebar-close"
          onClick={() => getCurrentWindow().close()}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Resize handles on all edges and corners */}
      {resizeHandles.map((h) => (
        <div
          key={h.direction}
          style={{
            position: "absolute",
            ...h.style,
            cursor: h.cursor,
            zIndex: 200,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(h.direction);
          }}
        />
      ))}
    </>
  );
}
