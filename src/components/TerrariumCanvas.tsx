import { useRef, useEffect, useCallback, useState } from "react";
import type { WorldState, Agent } from "../types/world";
import { AGENT_COLORS } from "./AgentSprites";
import { registry } from "../themes";

interface TerrariumCanvasProps {
  worldState: WorldState | null;
  onAgentClick: (agentId: string) => void;
  onBallThrow: (x: number, y: number, vx: number, vy: number) => void;
  onBackgroundClick: () => void;
  onMouseUpdate: (x: number | null, y: number | null) => void;
}

const AGENT_SIZE = 32;
const BALL_SIZE = 10;

// Image cache for gear/agent images (SVG, PNG)
const imageCache = new Map<string, HTMLImageElement>();
function getOrLoadImage(url: string): HTMLImageElement | null {
  const cached = imageCache.get(url);
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return null; // not ready yet
}

export function TerrariumCanvas({
  worldState,
  onAgentClick,
  onBallThrow,
  onBackgroundClick,
  onMouseUpdate,
}: TerrariumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragCurrent, setDragCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Hover greeting state
  const hoveredAgentRef = useRef<string | null>(null);
  const hoverBubbleRef = useRef<{
    agentId: string;
    emoji: string;
    startTime: number;
    duration: number;
  } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Pick a mood-based greeting emoji for an agent
  const pickGreetingEmoji = useCallback((agent: Agent): string => {
    const greetings: Record<string, string[]> = {
      Idle: ["👋", "😊", "🙂", "🫡"],
      Walking: ["🚶", "😄", "✌️", "🎵"],
      Running: ["💨", "😅", "🏃", "⚡"],
      Interacting: ["💬", "🤗", "😁", "🥰"],
      Chatting: ["💭", "🗨️", "😇"],
    };
    const pool = greetings[agent.state] ?? agent.personality.chat_emojis;
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  // Play an Animalese-style cute voice greeting via Web Audio API
  const playGreetingSound = useCallback((agent: Agent) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      // Voice profile from package registry
      const agentDef = registry.getAgent(agent.avatar);
      const v = agentDef?.voice ?? {
        basePitch: 500,
        pitchVar: 80,
        wave: "sine" as OscillatorType,
        syllables: 3,
        speed: 0.07,
        volume: 0.08,
      };

      let t = ctx.currentTime;
      for (let i = 0; i < v.syllables; i++) {
        const freq =
          v.basePitch + (Math.random() - 0.5) * v.pitchVar * 2;

        const osc = ctx.createOscillator();
        osc.type = v.wave;
        osc.frequency.setValueAtTime(freq, t);
        // Slight pitch slide within each syllable for expressiveness
        osc.frequency.linearRampToValueAtTime(
          freq + (Math.random() - 0.5) * 60,
          t + v.speed * 0.8,
        );

        const gain = ctx.createGain();
        // Attack-sustain-release envelope for each syllable
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(v.volume, t + v.speed * 0.15);
        gain.gain.setValueAtTime(v.volume * 0.8, t + v.speed * 0.6);
        gain.gain.linearRampToValueAtTime(0.001, t + v.speed * 0.95);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + v.speed);

        t += v.speed;
      }
    } catch {
      // Audio not available, silently skip
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldState) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear with transparency
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sort agents by Y position for z-ordering
    const sortedAgents = [...worldState.agents].sort(
      (a, b) => a.position.y - b.position.y,
    );

    // Draw agents
    for (const agent of sortedAgents) {
      drawAgent(ctx, agent);
    }

    // Draw ball
    if (worldState.ball) {
      const ball = worldState.ball;
      ctx.save();
      ctx.fillStyle = "#FF5722";
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, BALL_SIZE, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(
        ball.position.x - 2,
        ball.position.y - 2,
        BALL_SIZE * 0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    // Draw chat bubbles (emoji interactions)
    for (const bubble of worldState.bubbles) {
      const agent = worldState.agents.find((a) => a.id === bubble.agent_id);
      if (agent) {
        drawBubble(
          ctx,
          agent.position.x,
          agent.position.y - AGENT_SIZE - 10,
          bubble.content,
        );
      }
    }

    // Draw hover greeting bubble
    const hb = hoverBubbleRef.current;
    if (hb) {
      const elapsed = (Date.now() - hb.startTime) / 1000;
      if (elapsed < hb.duration) {
        const agent = worldState.agents.find((a) => a.id === hb.agentId);
        if (agent) {
          // Fade in for first 0.2s, fade out for last 0.3s
          let alpha = 1;
          if (elapsed < 0.2) alpha = elapsed / 0.2;
          else if (elapsed > hb.duration - 0.3)
            alpha = (hb.duration - elapsed) / 0.3;

          // Float upward slightly
          const floatY = -elapsed * 8;

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          drawBubble(
            ctx,
            agent.position.x,
            agent.position.y - AGENT_SIZE - 16 + floatY,
            hb.emoji,
          );
          ctx.restore();
        }
      } else {
        hoverBubbleRef.current = null;
      }
    }

    // Draw drag line for ball throw
    if (dragStart && dragCurrent) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 87, 34, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(dragStart.x, dragStart.y);
      ctx.lineTo(dragCurrent.x, dragCurrent.y);
      ctx.stroke();
      ctx.restore();
    }
  }, [worldState, dragStart, dragCurrent]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    return () => resizeObserver.disconnect();
  }, []);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const findAgentAt = useCallback(
    (x: number, y: number): Agent | null => {
      if (!worldState) return null;
      for (const agent of worldState.agents) {
        const dx = x - agent.position.x;
        const dy = y - agent.position.y;
        if (
          Math.abs(dx) < AGENT_SIZE / 2 &&
          Math.abs(dy) < AGENT_SIZE / 2
        ) {
          return agent;
        }
      }
      return null;
    },
    [worldState],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPos(e);
      const agent = findAgentAt(pos.x, pos.y);
      if (agent) {
        // Click on agent — open chat, don't start drag
        e.stopPropagation();
        onAgentClick(agent.id);
      } else {
        // Start potential drag for ball throw
        setDragStart(pos);
        setDragCurrent(pos);
      }
    },
    [getCanvasPos, findAgentAt, onAgentClick],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getCanvasPos(e);
      onMouseUpdate(pos.x, pos.y);

      if (dragStart) {
        setDragCurrent(pos);
        return;
      }
      const agent = findAgentAt(pos.x, pos.y);
      const newId = agent?.id ?? null;

      if (newId !== hoveredAgentRef.current) {
        hoveredAgentRef.current = newId;
        if (agent) {
          // New hover — show greeting and play sound
          hoverBubbleRef.current = {
            agentId: agent.id,
            emoji: pickGreetingEmoji(agent),
            startTime: Date.now(),
            duration: 1.8,
          };
          playGreetingSound(agent);
        }
      }

      // Update cursor
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = agent ? "pointer" : "default";
      }
    },
    [dragStart, getCanvasPos, findAgentAt, pickGreetingEmoji, playGreetingSound, onMouseUpdate],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragStart) {
        const end = getCanvasPos(e);
        const vx = (end.x - dragStart.x) * 5;
        const vy = (end.y - dragStart.y) * 5;
        const dist = Math.sqrt(vx * vx + vy * vy);
        if (dist > 20) {
          // Throw ball
          onBallThrow(dragStart.x, dragStart.y, vx, vy);
        } else {
          // Short click on background — dismiss chats
          onBackgroundClick();
        }
        setDragStart(null);
        setDragCurrent(null);
      }
    },
    [dragStart, getCanvasPos, onBallThrow, onBackgroundClick],
  );

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        cursor: dragStart ? "crosshair" : "default",
        zIndex: 1,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setDragStart(null);
        setDragCurrent(null);
        hoveredAgentRef.current = null;
        onMouseUpdate(null, null);
      }}
    />
  );
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent) {
  const { x, y } = agent.position;
  const agentDef = registry.getAgent(agent.avatar);
  const colors = agentDef?.colors ?? AGENT_COLORS[agent.avatar] ?? AGENT_COLORS.cat;
  const isMoving =
    agent.state === "Walking" ||
    agent.state === "Running" ||
    agent.state === "Sprinting";
  const isFast = agent.state === "Running" || agent.state === "Sprinting";
  const flip = agent.direction === "Left";
  const t = Date.now();

  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);

  // Shadow — stretches when running
  const shadowW = isFast ? AGENT_SIZE / 2.2 : AGENT_SIZE / 3;
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(0, AGENT_SIZE / 2 - 2, shadowW, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animation parameters
  const walkCycle = t / (isFast ? 80 : 120);
  const bob = isMoving ? Math.sin(walkCycle) * 2.5 : Math.sin(t / 600) * 0.8;
  const legPhase = isMoving ? walkCycle : 0;
  const squish = isMoving
    ? 1 + Math.sin(walkCycle * 2) * 0.04
    : 1 + Math.sin(t / 500) * 0.015; // idle breathing

  // Draw back-slot gear (cape etc.) BEHIND the agent body
  drawGearBySlots(ctx, agent.gear ?? [], bob, ["back"]);

  // Dispatch to per-agent draw
  switch (agent.avatar) {
    case "cat":
      drawCat(ctx, colors, bob, legPhase, squish, isMoving, t);
      break;
    case "copilot":
      drawCopilot(ctx, colors, bob, legPhase, squish, isMoving, t);
      break;
    case "squirrel":
      drawSquirrel(ctx, colors, bob, legPhase, squish, isMoving, t);
      break;
    case "penguin":
      drawPenguin(ctx, colors, bob, legPhase, squish, isMoving, t);
      break;
    case "ghost":
      drawGhost(ctx, colors, bob, t);
      break;
    default:
      drawGenericAgent(ctx, colors, bob, legPhase, squish, isMoving, t);
      break;
  }

  // State indicator particles
  if (agent.state === "Interacting") {
    for (let i = 0; i < 3; i++) {
      const angle = (t / 300 + i * 2.1) % (Math.PI * 2);
      const px = Math.cos(angle) * 14;
      const py = -AGENT_SIZE / 2 - 6 + Math.sin(angle * 2) * 3;
      ctx.fillStyle = `rgba(255, 235, 59, ${0.5 + Math.sin(t / 200 + i) * 0.3})`;
      ctx.beginPath();
      ctx.arc(px, py + bob, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw equipped gear (front slots: hat, face, neck, body)
  drawGearBySlots(ctx, agent.gear ?? [], bob, ["body", "neck", "face", "hat"]);

  // Name tag with background
  if (flip) ctx.scale(-1, 1);
  ctx.font = "bold 8px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  const nameW = ctx.measureText(agent.name).width + 6;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.roundRect(-nameW / 2, AGENT_SIZE / 2 + 4, nameW, 12, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(agent.name, 0, AGENT_SIZE / 2 + 13);

  ctx.restore();
}

// --- Gear rendering ---

function drawGearBySlots(
  ctx: CanvasRenderingContext2D,
  gearIds: string[],
  bob: number,
  slots: string[],
) {
  for (const gearId of gearIds) {
    const def = registry.getGear(gearId);
    if (!def || !slots.includes(def.slot)) continue;
    ctx.save();

    // If an image is provided, draw it instead of the shape primitive
    if (def.image) {
      const img = getOrLoadImage(def.image);
      if (img) {
        const w = def.imageWidth ?? AGENT_SIZE;
        const h = def.imageHeight ?? AGENT_SIZE;
        const anchorY = getSlotAnchorY(def.slot, bob) + (def.imageOffsetY ?? 0);
        ctx.drawImage(img, -w / 2, anchorY - h / 2, w, h);
      }
      ctx.restore();
      continue;
    }

    switch (def.shape) {
      case "top-hat":
        drawTopHat(ctx, def.color, def.accentColor, bob);
        break;
      case "party-hat":
        drawPartyHat(ctx, def.color, def.accentColor, bob);
        break;
      case "crown":
        drawCrown(ctx, def.color, def.accentColor, bob);
        break;
      case "wizard-hat":
        drawWizardHat(ctx, def.color, def.accentColor, bob);
        break;
      case "flower-crown":
        drawFlowerCrown(ctx, def.color, def.accentColor, bob);
        break;
      case "bow-tie":
        drawBowTie(ctx, def.color, bob);
        break;
      case "scarf":
        drawScarf(ctx, def.color, def.accentColor, bob);
        break;
      case "sunglasses":
        drawSunglasses(ctx, def.color, bob);
        break;
      case "cape":
        drawCape(ctx, def.color, bob);
        break;
      case "sweater":
        drawSweater(ctx, def.color, def.accentColor, bob);
        break;
    }
    ctx.restore();
  }
}

/** Default Y anchor per gear slot, relative to agent center */
function getSlotAnchorY(slot: string, bob: number): number {
  switch (slot) {
    case "hat": return -AGENT_SIZE / 2 - 4 + bob;
    case "face": return -12 + bob;
    case "neck": return AGENT_SIZE / 4 - 2 + bob;
    case "body": return -AGENT_SIZE / 8 + bob;
    case "back": return -AGENT_SIZE / 4 + bob;
    default: return bob;
  }
}

function drawTopHat(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const hatY = -AGENT_SIZE / 2 - 4 + bob;
  // Brim
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, hatY, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cylinder
  ctx.fillRect(-6, hatY - 12, 12, 12);
  // Band
  ctx.fillStyle = accent ?? "#C62828";
  ctx.fillRect(-6, hatY - 4, 12, 2.5);
}

function drawPartyHat(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const hatY = -AGENT_SIZE / 2 - 4 + bob;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-7, hatY);
  ctx.lineTo(0, hatY - 16);
  ctx.lineTo(7, hatY);
  ctx.closePath();
  ctx.fill();
  // Stripes
  ctx.strokeStyle = accent ?? "#FFC107";
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const w = 7 * (1 - t);
    const sy = hatY - 16 * t;
    ctx.beginPath();
    ctx.moveTo(-w, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }
  // Pom-pom
  ctx.fillStyle = accent ?? "#FFC107";
  ctx.beginPath();
  ctx.arc(0, hatY - 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrown(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const hatY = -AGENT_SIZE / 2 - 3 + bob;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-8, hatY);
  ctx.lineTo(-8, hatY - 8);
  ctx.lineTo(-4, hatY - 5);
  ctx.lineTo(0, hatY - 10);
  ctx.lineTo(4, hatY - 5);
  ctx.lineTo(8, hatY - 8);
  ctx.lineTo(8, hatY);
  ctx.closePath();
  ctx.fill();
  // Jewels
  ctx.fillStyle = accent ?? "#FF5722";
  ctx.beginPath();
  ctx.arc(0, hatY - 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2196F3";
  ctx.beginPath();
  ctx.arc(-5, hatY - 3, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5, hatY - 3, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawWizardHat(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const hatY = -AGENT_SIZE / 2 - 3 + bob;
  // Brim
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, hatY, 11, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cone with curve
  ctx.beginPath();
  ctx.moveTo(-9, hatY);
  ctx.quadraticCurveTo(-4, hatY - 18, 3, hatY - 22);
  ctx.quadraticCurveTo(6, hatY - 10, 9, hatY);
  ctx.closePath();
  ctx.fill();
  // Stars
  ctx.fillStyle = accent ?? "#FFD54F";
  ctx.font = "6px serif";
  ctx.fillText("★", -2, hatY - 8);
  ctx.fillText("★", 2, hatY - 14);
}

function drawFlowerCrown(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const hatY = -AGENT_SIZE / 2 - 2 + bob;
  // Vine
  ctx.strokeStyle = accent ?? "#81C784";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, hatY + 2, 9, Math.PI, 0);
  ctx.stroke();
  // Flowers
  const positions = [-7, -3, 1, 5, 9];
  for (let i = 0; i < positions.length; i++) {
    ctx.fillStyle = i % 2 === 0 ? color : "#FFE082";
    ctx.beginPath();
    ctx.arc(positions[i], hatY - 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF9C4";
    ctx.beginPath();
    ctx.arc(positions[i], hatY - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBowTie(
  ctx: CanvasRenderingContext2D,
  color: string,
  bob: number
) {
  const neckY = AGENT_SIZE / 4 - 2 + bob;
  ctx.fillStyle = color;
  // Left triangle
  ctx.beginPath();
  ctx.moveTo(0, neckY);
  ctx.lineTo(-6, neckY - 3);
  ctx.lineTo(-6, neckY + 3);
  ctx.closePath();
  ctx.fill();
  // Right triangle
  ctx.beginPath();
  ctx.moveTo(0, neckY);
  ctx.lineTo(6, neckY - 3);
  ctx.lineTo(6, neckY + 3);
  ctx.closePath();
  ctx.fill();
  // Center knot
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, neckY, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawScarf(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const neckY = AGENT_SIZE / 4 - 2 + bob;
  ctx.fillStyle = color;
  // Wrap around neck
  ctx.beginPath();
  ctx.ellipse(0, neckY, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hanging end
  ctx.fillRect(-3, neckY + 2, 5, 10);
  // Stripes on the hanging end
  ctx.fillStyle = accent ?? "#BBDEFB";
  ctx.fillRect(-3, neckY + 4, 5, 1.5);
  ctx.fillRect(-3, neckY + 8, 5, 1.5);
}

function drawSunglasses(
  ctx: CanvasRenderingContext2D,
  color: string,
  bob: number
) {
  const eyeY = -12 + bob;
  ctx.fillStyle = color;
  // Left lens
  ctx.beginPath();
  ctx.roundRect(-8, eyeY - 3, 7, 5, 1.5);
  ctx.fill();
  // Right lens
  ctx.beginPath();
  ctx.roundRect(1, eyeY - 3, 7, 5, 1.5);
  ctx.fill();
  // Bridge
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-1, eyeY);
  ctx.lineTo(1, eyeY);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(-8, eyeY - 1);
  ctx.lineTo(-12, eyeY - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, eyeY - 1);
  ctx.lineTo(12, eyeY - 2);
  ctx.stroke();
}

function drawCape(
  ctx: CanvasRenderingContext2D,
  color: string,
  bob: number
) {
  const topY = -AGENT_SIZE / 4 + bob;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(-8, topY);
  ctx.quadraticCurveTo(-12, topY + 16, -6, topY + 24);
  ctx.lineTo(6, topY + 24);
  ctx.quadraticCurveTo(12, topY + 16, 8, topY);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

function drawSweater(
  ctx: CanvasRenderingContext2D,
  color: string,
  accent: string | undefined,
  bob: number
) {
  const bodyY = -AGENT_SIZE / 8 + bob;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.roundRect(-9, bodyY, 18, 12, 3);
  ctx.fill();
  // Pattern
  ctx.fillStyle = accent ?? "#FFF9C4";
  ctx.fillRect(-7, bodyY + 3, 14, 1.5);
  ctx.fillRect(-7, bodyY + 7, 14, 1.5);
  ctx.globalAlpha = 1.0;
}

// --- Per-agent sprite functions ---

function drawLegs(
  ctx: CanvasRenderingContext2D,
  color: string,
  bob: number,
  legPhase: number,
  isMoving: boolean,
  legSpread: number,
  legLen: number,
) {
  const lOff = isMoving ? Math.sin(legPhase) * 4 : 0;
  const rOff = isMoving ? Math.sin(legPhase + Math.PI) * 4 : 0;
  ctx.fillStyle = color;
  // Left leg
  ctx.beginPath();
  ctx.roundRect(-legSpread - 2, AGENT_SIZE / 4 - 2 + bob + lOff, 4, legLen, 2);
  ctx.fill();
  // Right leg
  ctx.beginPath();
  ctx.roundRect(legSpread - 2, AGENT_SIZE / 4 - 2 + bob + rOff, 4, legLen, 2);
  ctx.fill();
  // Feet
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-legSpread, AGENT_SIZE / 4 + legLen - 1 + bob + lOff, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(legSpread, AGENT_SIZE / 4 + legLen - 1 + bob + rOff, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  eyeColor: string,
  cx: number,
  cy: number,
  size: number,
  t: number,
) {
  const blinkFrame = Math.floor(t / 3000) % 8 === 0;
  const halfBlink = Math.floor(t / 3000) % 8 === 1 && (t % 3000) < 100;

  if (blinkFrame || halfBlink) {
    // Blink — curved line
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx - 5, cy, size * 0.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 5, cy, size * 0.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    // Open eyes with highlight
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy, size + 0.5, size + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5, cy, size + 0.5, size + 1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(cx - 4.5, cy + 0.5, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 5.5, cy + 0.5, size * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(cx - 3.5, cy - 0.5, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 6.5, cy - 0.5, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCheeks(
  ctx: CanvasRenderingContext2D,
  color: string,
  cx: number,
  cy: number,
) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx - 9, cy + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 9, cy + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  style: "smile" | "small" | "o" | "w",
) {
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  switch (style) {
    case "smile":
      ctx.beginPath();
      ctx.arc(cx, cy - 1, 3, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case "small":
      ctx.beginPath();
      ctx.arc(cx, cy - 0.5, 1.5, 0.3, Math.PI - 0.3);
      ctx.stroke();
      break;
    case "o":
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "w":
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 1);
      ctx.quadraticCurveTo(cx - 1.5, cy + 2, cx, cy);
      ctx.quadraticCurveTo(cx + 1.5, cy + 2, cx + 3, cy - 1);
      ctx.stroke();
      break;
  }
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
) {
  const headY = -10 + bob;

  // Tail — large fluffy S-curve
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  const tailWag = Math.sin(t / 200) * 6;
  ctx.moveTo(10, 4 + bob);
  ctx.bezierCurveTo(18, -2 + bob + tailWag, 20, -14 + bob - tailWag, 14, -18 + bob + tailWag);
  ctx.bezierCurveTo(12, -14 + bob - tailWag, 14, -2 + bob + tailWag, 10, 4 + bob);
  ctx.fill();

  // Legs
  drawLegs(ctx, c.accent, bob, legPhase, isMoving, 5, 8);

  // Body — pudgy oval
  ctx.fillStyle = c.body;
  ctx.save();
  ctx.scale(squish, 2 - squish);
  ctx.beginPath();
  ctx.ellipse(0, (2 + bob) / (2 - squish), 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Head
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner ears
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.moveTo(-10, headY - 5);
  ctx.lineTo(-7, headY - 16);
  ctx.lineTo(-2, headY - 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, headY - 6);
  ctx.lineTo(7, headY - 16);
  ctx.lineTo(10, headY - 5);
  ctx.fill();
  // Ear pink insides
  ctx.fillStyle = "#FFAB91";
  ctx.beginPath();
  ctx.moveTo(-8, headY - 6);
  ctx.lineTo(-6.5, headY - 13);
  ctx.lineTo(-3, headY - 7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(3, headY - 7);
  ctx.lineTo(6.5, headY - 13);
  ctx.lineTo(8, headY - 6);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 0.7;
  for (const dir of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(dir * 6, headY + 2 + i * 2);
      ctx.lineTo(dir * 16, headY + i * 3);
      ctx.stroke();
    }
  }

  drawEyes(ctx, c.eyes, 0, headY - 2, 2.5, t);
  drawCheeks(ctx, c.cheek, 0, headY + 1);
  drawMouth(ctx, 0, headY + 5, "w");
}

function drawCopilot(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
) {
  const headY = -10 + bob;

  // Legs
  drawLegs(ctx, c.accent, bob, legPhase, isMoving, 5, 8);

  // Body
  ctx.fillStyle = c.body;
  ctx.save();
  ctx.scale(squish, 2 - squish);
  ctx.beginPath();
  ctx.ellipse(0, (2 + bob) / (2 - squish), 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cape/wings (animated flutter)
  const flutter = Math.sin(t / 250) * 3;
  ctx.fillStyle = "rgba(31, 111, 235, 0.35)";
  ctx.beginPath();
  ctx.moveTo(-9, -2 + bob);
  ctx.bezierCurveTo(-16, 4 + bob + flutter, -14, 14 + bob - flutter, -8, 12 + bob);
  ctx.lineTo(-7, 4 + bob);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9, -2 + bob);
  ctx.bezierCurveTo(16, 4 + bob - flutter, 14, 14 + bob + flutter, 8, 12 + bob);
  ctx.lineTo(7, 4 + bob);
  ctx.fill();

  // Head — slightly more angular
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Visor band
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.roundRect(-10, headY - 4, 20, 6, 3);
  ctx.fill();
  // Visor glow gradient
  const visorGrad = ctx.createLinearGradient(-8, headY - 3, 8, headY + 1);
  visorGrad.addColorStop(0, "#58A6FF");
  visorGrad.addColorStop(0.5, "#79C0FF");
  visorGrad.addColorStop(1, "#58A6FF");
  ctx.fillStyle = visorGrad;
  ctx.beginPath();
  ctx.roundRect(-8, headY - 3, 16, 4, 2);
  ctx.fill();

  // Visor scan line animation
  const scanX = ((t / 15) % 24) - 12;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.roundRect(Math.max(-8, scanX), headY - 2.5, 4, 3, 1);
  ctx.fill();

  // Top sparkle
  const sparkleAlpha = 0.3 + Math.sin(t / 400) * 0.5;
  const sparkleSize = 2 + Math.sin(t / 300) * 1;
  ctx.fillStyle = `rgba(88, 166, 255, ${sparkleAlpha})`;
  drawStar(ctx, 0, headY - 14, sparkleSize, 4);

  drawCheeks(ctx, c.cheek, 0, headY + 1);
  drawMouth(ctx, 0, headY + 5, "smile");
}

function drawSquirrel(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
) {
  const headY = -10 + bob;

  // Big fluffy tail
  ctx.fillStyle = c.body;
  const tailSway = Math.sin(t / 300) * 5;
  ctx.beginPath();
  ctx.moveTo(8, 6 + bob);
  ctx.bezierCurveTo(16, 0 + bob + tailSway, 22, -10 + bob - tailSway, 18, -20 + bob);
  ctx.bezierCurveTo(14, -22 + bob + tailSway, 10, -16 + bob, 12, -8 + bob - tailSway);
  ctx.bezierCurveTo(10, -2 + bob + tailSway, 10, 4 + bob, 8, 6 + bob);
  ctx.fill();
  // Tail highlight
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.bezierCurveTo(14, -2 + bob + tailSway, 18, -12 + bob - tailSway, 16, -18 + bob);
  ctx.bezierCurveTo(14, -16 + bob, 12, -8 + bob, 10, -2 + bob);
  ctx.fill();

  // Legs
  drawLegs(ctx, c.accent, bob, legPhase, isMoving, 4, 7);

  // Body — rounder
  ctx.fillStyle = c.body;
  ctx.save();
  ctx.scale(squish, 2 - squish);
  ctx.beginPath();
  ctx.ellipse(0, (2 + bob) / (2 - squish), 9, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Belly
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, 4 + bob, 5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 9, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears — round
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.arc(-7, headY - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, headY - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFAB91";
  ctx.beginPath();
  ctx.arc(-7, headY - 8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, headY - 8, 2, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = "#5D4037";
  ctx.beginPath();
  ctx.ellipse(0, headY + 1, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Acorn held (when idle)
  if (!isMoving) {
    ctx.fillStyle = "#795548";
    ctx.beginPath();
    ctx.ellipse(6, 6 + bob, 3, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4E342E";
    ctx.beginPath();
    ctx.roundRect(4, 2 + bob, 5, 3, 2);
    ctx.fill();
  }

  drawEyes(ctx, c.eyes, 0, headY - 2, 2, t);
  drawCheeks(ctx, c.cheek, 0, headY + 1);
  drawMouth(ctx, 0, headY + 4, isMoving ? "o" : "small");
}

function drawPenguin(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  legPhase: number,
  _squish: number,
  isMoving: boolean,
  t: number,
) {
  const headY = -10 + bob;
  const waddle = isMoving ? Math.sin(t / 150) * 4 : 0;

  // Legs — orange feet
  const lOff = isMoving ? Math.sin(legPhase) * 3 : 0;
  const rOff = isMoving ? Math.sin(legPhase + Math.PI) * 3 : 0;
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.ellipse(-5, AGENT_SIZE / 2 - 4 + bob + lOff, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5, AGENT_SIZE / 2 - 4 + bob + rOff, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body — oval with waddle rotation
  ctx.save();
  ctx.rotate((waddle * Math.PI) / 180);
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.ellipse(0, 2 + bob, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // White belly
  ctx.fillStyle = "#ECEFF1";
  ctx.beginPath();
  ctx.ellipse(0, 4 + bob, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings/flippers
  const flapAngle = isMoving ? Math.sin(t / 200) * 0.3 : 0.1;
  ctx.fillStyle = c.body;
  ctx.save();
  ctx.translate(-11, -2 + bob);
  ctx.rotate(-flapAngle - 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(11, -2 + bob);
  ctx.rotate(flapAngle + 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore(); // un-waddle

  // Head
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // White face patch
  ctx.fillStyle = "#ECEFF1";
  ctx.beginPath();
  ctx.ellipse(0, headY + 1, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(-2, headY + 2);
  ctx.lineTo(0, headY + 6);
  ctx.lineTo(2, headY + 2);
  ctx.fill();

  // Scarf
  ctx.fillStyle = "#E53935";
  ctx.beginPath();
  ctx.roundRect(-8, headY + 6, 16, 4, 2);
  ctx.fill();
  // Scarf tail
  ctx.beginPath();
  ctx.roundRect(5, headY + 8, 4, 8, 2);
  ctx.fill();

  drawEyes(ctx, c.eyes, 0, headY - 1, 2, t);
  drawCheeks(ctx, c.cheek, 0, headY + 1);
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  t: number,
) {
  const headY = -6 + bob;
  const floatBob = Math.sin(t / 500) * 4;
  const yBase = floatBob;

  // Ghostly glow
  ctx.fillStyle = "rgba(200, 200, 255, 0.08)";
  ctx.beginPath();
  ctx.arc(0, yBase - 4, 22, 0, Math.PI * 2);
  ctx.fill();

  // Body — rounded top, wavy bottom
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(-12, 6 + yBase);
  ctx.lineTo(-12, -4 + yBase);
  ctx.quadraticCurveTo(-12, -16 + yBase, 0, -16 + yBase);
  ctx.quadraticCurveTo(12, -16 + yBase, 12, -4 + yBase);
  ctx.lineTo(12, 6 + yBase);
  // Wavy bottom
  for (let i = 0; i < 5; i++) {
    const wx = 12 - (i * 24) / 5;
    const wy = 6 + yBase + (i % 2 === 0 ? 6 : 0) + Math.sin(t / 300 + i) * 2;
    const nx = 12 - ((i + 1) * 24) / 5;
    ctx.quadraticCurveTo(wx - 2.4, wy, nx, 6 + yBase + ((i + 1) % 2 === 0 ? 6 : 0));
  }
  ctx.closePath();
  ctx.fill();

  // Inner shimmer
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(-3, -2 + yBase, 6, 8, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes — larger, more expressive
  const eyeY = headY - 2 + floatBob;
  ctx.fillStyle = c.eyes;
  ctx.beginPath();
  ctx.ellipse(-4, eyeY, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4, eyeY, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupils
  ctx.fillStyle = "#4A148C";
  ctx.beginPath();
  ctx.arc(-3.5, eyeY + 0.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4.5, eyeY + 0.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Eye shine
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(-2.5, eyeY - 1, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5.5, eyeY - 1, 0.8, 0, Math.PI * 2);
  ctx.fill();

  drawMouth(ctx, 0, headY + 4 + floatBob, "o");

  // Floating sparkles
  for (let i = 0; i < 2; i++) {
    const sx = Math.sin(t / 600 + i * 3) * 16;
    const sy = -14 + Math.cos(t / 800 + i * 2) * 6 + yBase;
    const sa = 0.2 + Math.sin(t / 400 + i * 5) * 0.3;
    ctx.fillStyle = `rgba(206, 147, 216, ${sa})`;
    drawStar(ctx, sx, sy, 2, 4);
  }
}

function drawGenericAgent(
  ctx: CanvasRenderingContext2D,
  c: (typeof AGENT_COLORS)[string],
  bob: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
) {
  const headY = -10 + bob;
  drawLegs(ctx, c.accent, bob, legPhase, isMoving, 5, 8);

  ctx.fillStyle = c.body;
  ctx.save();
  ctx.scale(squish, 2 - squish);
  ctx.beginPath();
  ctx.ellipse(0, (2 + bob) / (2 - squish), 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  drawEyes(ctx, c.eyes, 0, headY - 2, 2.5, t);
  drawCheeks(ctx, c.cheek, 0, headY + 1);
  drawMouth(ctx, 0, headY + 5, "smile");
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  points: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.4;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
) {
  ctx.save();

  // Bubble background
  const padding = 6;
  ctx.font = "16px serif";
  const metrics = ctx.measureText(text);
  const width = metrics.width + padding * 2;
  const height = 24;

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height, width, height, 8);
  ctx.fill();

  // Pointer
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x + 4, y);
  ctx.fill();

  // Text
  ctx.fillStyle = "#333";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - height / 2);

  ctx.restore();
}
