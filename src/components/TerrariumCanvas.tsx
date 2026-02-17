import { useRef, useEffect, useCallback, useState } from "react";
import type { WorldState, Agent } from "../types/world";
import { registry } from "../themes";
import { playAgentSound, getSharedAudioCtx } from "../audio/agentSounds";
import { speakText } from "../audio/tts";

interface TerrariumCanvasProps {
  worldState: WorldState | null;
  onAgentClick: (agentId: string) => void;
  onBallThrow: (x: number, y: number, vx: number, vy: number) => void;
  onBackgroundClick: () => void;
  onMouseUpdate: (x: number | null, y: number | null) => void;
  thinkingAgentIds?: ReadonlySet<string>;
}

const AGENT_SIZE = 64;
const BALL_SIZE = 10;

/** Perspective scale: 0.6 at horizon (groundY) → 1.0 at bottom (boundsY) */
function perspectiveScale(y: number, groundY: number, boundsY: number): number {
  const t = Math.max(0, Math.min(1, (y - groundY) / (boundsY - groundY)));
  return 0.6 + 0.4 * t;
}

/** Fallback drawSpec for avatars without one */
const DEFAULT_DRAW_SPEC: import("../themes/PackageTypes").DrawSpec = {
  layers: [
    { type: "legs", color: "#666" },
    { type: "body", color: "#888" },
    { type: "head", color: "#AAA" },
    { type: "eyes", color: "#333" },
    { type: "cheeks", color: "#FF8A80" },
    { type: "mouth", style: "smile" },
  ],
};

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
  thinkingAgentIds,
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
  const attentionSoundTimers = useRef<Map<string, number>>(new Map());
  const prevBallRef = useRef<{ vx: number; vy: number; hv: number; captures: number; active: boolean } | null>(null);
  const ballSquashRef = useRef(0);
  const spokenBubblesRef = useRef(new Set<string>());// -1 = squashed (wide+short), +1 = stretched (tall+narrow), decays to 0

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

  // Play agent sounds using shared mood-based system
  const playHoverSound = useCallback((agent: Agent) => {
    playAgentSound(agent.avatar, "hover");
  }, []);

  const playAttentionSound = useCallback((agent: Agent) => {
    playAgentSound(agent.avatar, "attention");
  }, []);

  const playCaptureAgentSound = useCallback((avatar: string) => {
    playAgentSound(avatar, "capture");
  }, []);

  // Play 8-bit kick sound
  const playKickSound = useCallback(() => {
    try {
      const ctx = getSharedAudioCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.12);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.04, t);
      ng.gain.linearRampToValueAtTime(0, t + 0.03);
      noise.connect(ng);
      ng.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.03);
    } catch {}
  }, []);

  // Play 8-bit bounce sound
  const playBounceSound = useCallback(() => {
    try {
      const ctx = getSharedAudioCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(500, t + 0.06);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }, []);

  // Play 8-bit capture celebration sound (ascending arpeggio)
  const playCaptureSound = useCallback(() => {
    try {
      const ctx = getSharedAudioCtx();
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, t + i * 0.07);
        gain.gain.linearRampToValueAtTime(0, t + i * 0.07 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t + i * 0.07);
        osc.stop(t + i * 0.07 + 0.1);
      });
    } catch {}
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldState) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear with transparency
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const groundY = canvas.height * worldState.ground_y_ratio;
    const boundsY = canvas.height;

    // Sort agents by Y position for z-ordering (far → near)
    const sortedAgents = [...worldState.agents].sort(
      (a, b) => a.position.y - b.position.y,
    );

    // Draw agents with perspective scaling
    for (const agent of sortedAgents) {
      const scale = perspectiveScale(agent.position.y, groundY, boundsY);
      drawAgent(ctx, agent, thinkingAgentIds?.has(agent.id), scale);
    }

    // Play attention sounds periodically
    const now = Date.now();
    const intervalMs = (worldState.attention_interval_secs ?? 5) * 1000;
    for (const agent of worldState.agents) {
      if (agent.state === "NeedsAttention") {
        const lastPlayed = attentionSoundTimers.current.get(agent.id) ?? 0;
        if (now - lastPlayed >= intervalMs) {
          attentionSoundTimers.current.set(agent.id, now);
          playAttentionSound(agent);
        }
      } else {
        attentionSoundTimers.current.delete(agent.id);
      }
    }

    // Draw ball with perspective
    if (worldState.ball) {
      const ball = worldState.ball;
      const ballScale = perspectiveScale(ball.position.y, groundY, boundsY);
      const ballHeight = ball.height ?? 0;

      // Update squash spring (decay toward 0)
      ballSquashRef.current *= 0.85;
      if (Math.abs(ballSquashRef.current) < 0.01) ballSquashRef.current = 0;

      // Velocity-based stretch
      const speed = Math.sqrt(ball.velocity.x ** 2 + (ball.height_velocity ?? 0) ** 2);
      const velStretch = Math.min(speed / 400, 0.3);
      const velAngle = Math.atan2(-(ball.height_velocity ?? 0), ball.velocity.x);

      const squash = ballSquashRef.current;
      const sx = 1 + squash * 0.35 + velStretch * 0.3;
      const sy = 1 - squash * 0.35 - velStretch * 0.3;

      // Draw shadow: parallel sun-ray projection onto the ground plane.
      // Only draw a separate ground shadow when the ball is airborne.
      if (ballHeight > 2) {
        ctx.save();
        const shadowOffsetX = ballHeight * 0.15 * ballScale;
        const shadowOffsetY = ballHeight * 0.1 * ballScale;
        const shadowAlpha = Math.max(0.05, 0.25 - ballHeight * 0.0008);
        const shadowRadius = BALL_SIZE * ballScale;
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(
          ball.position.x + shadowOffsetX,
          ball.position.y + shadowOffsetY,
          shadowRadius,
          shadowRadius * 0.4,
          0, 0, Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }

      // Draw ball elevated above its ground position
      const screenY = ball.position.y - ballHeight * ballScale;
      ctx.save();
      ctx.translate(ball.position.x, screenY);

      if (speed > 50 && Math.abs(squash) < 0.1) {
        ctx.rotate(velAngle);
      }

      ctx.scale(sx * ballScale, sy * ballScale);

      ctx.fillStyle = "#FF5722";
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_SIZE, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(-2, -2, BALL_SIZE * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Detect ball kick and bounce events for sound effects
    const curBall = worldState.ball;
    const prev = prevBallRef.current;
    if (curBall && curBall.active) {
      if (prev) {
        // Capture: captures increased
        if (curBall.captures > prev.captures) {
          playCaptureSound();
          playKickSound();
          ballSquashRef.current = -0.8; // Kick squash
          // Play agent-specific capture chirp for the capturing agent
          const captureEmojis = ["⚽", "🎉", "😄", "🏆", "💪", "🙌"];
          const captureBubble = worldState.bubbles.find(
            (b) => b.is_emoji && captureEmojis.includes(b.content),
          );
          if (captureBubble) {
            const capAgent = worldState.agents.find((a) => a.id === captureBubble.agent_id);
            if (capAgent) playCaptureAgentSound(capAgent.avatar);
          }
        }
        // Bounce: height_velocity sign flipped (ground bounce)
        const curHV = curBall.height_velocity ?? 0;
        const prevHV = prev.hv ?? 0;
        if (prevHV < -5 && curHV > 5) {
          playBounceSound();
          ballSquashRef.current = -Math.min(Math.abs(prevHV) / 200, 1);
        }
        // Wall bounce: velocity.x sign flipped
        if (Math.abs(prevHV) < 50 && Math.sign(curBall.velocity.x) !== Math.sign(prev.vx ?? curBall.velocity.x) && Math.abs(curBall.velocity.x) > 10) {
          ballSquashRef.current = -0.5;
        }
      }
      prevBallRef.current = {
        vx: curBall.velocity.x,
        vy: curBall.velocity.y,
        hv: curBall.height_velocity ?? 0,
        captures: curBall.captures,
        active: curBall.active,
      };
    } else {
      prevBallRef.current = null;
    }

    // Draw chat bubbles (emoji interactions)
    for (const bubble of worldState.bubbles) {
      const agent = worldState.agents.find((a) => a.id === bubble.agent_id);
      if (agent) {
        const aScale = perspectiveScale(agent.position.y, groundY, boundsY);
        drawBubble(
          ctx,
          agent.position.x,
          agent.position.y - AGENT_SIZE * aScale - 10,
          bubble.content,
          bubble.is_event ? "thought" : "chat",
        );

        // TTS: speak non-emoji event bubbles if agent has TTS enabled
        if (bubble.is_event && !bubble.is_emoji && agent.backend_config?.tts_enabled) {
          const key = `${agent.id}:${bubble.content}`;
          if (!spokenBubblesRef.current.has(key)) {
            spokenBubblesRef.current.add(key);
            speakText(bubble.content, agent.avatar);
            // Clean up old keys to prevent memory leak
            if (spokenBubblesRef.current.size > 50) {
              const entries = [...spokenBubblesRef.current];
              entries.slice(0, 25).forEach((k) => spokenBubblesRef.current.delete(k));
            }
          }
        }
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

          const hScale = perspectiveScale(agent.position.y, groundY, boundsY);
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          drawBubble(
            ctx,
            agent.position.x,
            agent.position.y - AGENT_SIZE * hScale - 16 + floatY,
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
      const gY = (worldState.bounds.y || 600) * worldState.ground_y_ratio;
      const bY = worldState.bounds.y || 600;
      for (const agent of worldState.agents) {
        const scale = perspectiveScale(agent.position.y, gY, bY);
        const halfSize = (AGENT_SIZE * scale) / 2;
        const dx = x - agent.position.x;
        const dy = y - agent.position.y;
        if (Math.abs(dx) < halfSize && Math.abs(dy) < halfSize) {
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
          playHoverSound(agent);
        }
      }

      // Update cursor
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = agent ? "pointer" : "default";
      }
    },
    [dragStart, getCanvasPos, findAgentAt, pickGreetingEmoji, playHoverSound, onMouseUpdate],
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

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, isThinking?: boolean, pScale = 1) {
  const { x, y } = agent.position;
  const agentDef = registry.getAgent(agent.avatar);
  const isMoving =
    agent.state === "Walking" ||
    agent.state === "Running" ||
    agent.state === "Sprinting";
  const isFast = agent.state === "Running" || agent.state === "Sprinting";
  const flip = agent.direction === "Left";
  const t = Date.now();

  ctx.save();
  ctx.translate(x, y);
  // Apply perspective scaling
  ctx.scale(pScale, pScale);
  if (flip) ctx.scale(-1, 1);

  // Shadow — stretches when running
  const shadowW = isFast ? AGENT_SIZE / 2.2 : AGENT_SIZE / 3;
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(0, AGENT_SIZE / 2 - 2, shadowW, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Animation parameters
  const walkCycle = t / (isFast ? 80 : 120);
  const isFloat = agentDef?.drawSpec?.movement === "float";
  const bob = isFloat
    ? Math.sin(t / 500) * 4
    : isMoving ? Math.sin(walkCycle) * 2.5 : Math.sin(t / 600) * 0.8;
  const legPhase = isMoving ? walkCycle : 0;
  const squish = isFloat
    ? 1
    : isMoving
      ? 1 + Math.sin(walkCycle * 2) * 0.04
      : 1 + Math.sin(t / 500) * 0.015; // idle breathing

  // Draw back-slot gear (cape etc.) BEHIND the agent body
  drawGearBySlots(ctx, agent.gear ?? [], bob, ["back"]);

  // Dispatch to data-driven renderer
  const spec = agentDef?.drawSpec ?? DEFAULT_DRAW_SPEC;
  drawFromSpec(ctx, bob, legPhase, squish, isMoving, t, spec);

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

  // Attention indicator — pulsing bell above head
  if (agent.state === "NeedsAttention") {
    const pulse = 0.7 + Math.sin(t / 300) * 0.3;
    const bounce = Math.sin(t / 200) * 3;
    const bellY = -AGENT_SIZE / 2 - 18 + bob + bounce;
    // Glow ring
    ctx.fillStyle = `rgba(255, 193, 7, ${pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(0, bellY, 12, 0, Math.PI * 2);
    ctx.fill();
    // Bell emoji
    if (flip) ctx.scale(-1, 1); // unflip for text
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = pulse;
    ctx.fillText("🔔", 0, bellY);
    ctx.globalAlpha = 1;
    if (flip) ctx.scale(-1, 1); // re-flip
  }

  // Thinking indicator — pulsing thought bubble while waiting for reply
  if (isThinking) {
    const scale = 0.85 + Math.sin(t / 250) * 0.15;
    const floatY = Math.sin(t / 400) * 2;
    const thinkX = AGENT_SIZE / 2 + 4;
    const thinkY = -AGENT_SIZE / 2 - 22 + bob + floatY;
    if (flip) ctx.scale(-1, 1);
    ctx.save();
    ctx.translate(thinkX, thinkY);
    ctx.scale(scale, scale);
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💭", 0, 0);
    ctx.restore();
    // Small trailing dots
    for (let i = 0; i < 2; i++) {
      const dotScale = 0.3 - i * 0.1;
      const dotY = thinkY + 12 + i * 6;
      const dotX = thinkX - 4 + i * 2;
      ctx.fillStyle = "rgba(200, 200, 220, 0.6)";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2 * dotScale + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (flip) ctx.scale(-1, 1);
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

// ─── Data-Driven Renderer ───────────────────────────────────────────

import type { DrawSpec, DrawLayer } from "../themes/PackageTypes";

function drawFromSpec(
  ctx: CanvasRenderingContext2D,
  bob: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
  spec: DrawSpec,
) {
  const headY = -10 + bob;
  const waddleAmt = spec.waddleAmount ?? 0;
  const waddle = waddleAmt && isMoving ? Math.sin(t / 150) * waddleAmt : 0;

  if (waddle) {
    ctx.save();
    ctx.rotate((waddle * Math.PI) / 180);
  }

  for (const layer of spec.layers) {
    drawLayer(ctx, bob, headY, legPhase, squish, isMoving, t, layer);
  }

  if (waddle) {
    ctx.restore();
  }
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  bob: number,
  headY: number,
  legPhase: number,
  squish: number,
  isMoving: boolean,
  t: number,
  layer: DrawLayer,
) {
  switch (layer.type) {
    case "legs": {
      const spread = layer.spread ?? 5;
      const len = layer.length ?? 8;
      if (layer.footStyle === "flat") {
        const lOff = isMoving ? Math.sin(legPhase) * 3 : 0;
        const rOff = isMoving ? Math.sin(legPhase + Math.PI) * 3 : 0;
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.ellipse(-spread, AGENT_SIZE / 2 - 4 + bob + lOff, layer.footRx ?? 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(spread, AGENT_SIZE / 2 - 4 + bob + rOff, layer.footRx ?? 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawLegs(ctx, layer.color, bob, legPhase, isMoving, spread, len);
      }
      break;
    }

    case "body": {
      ctx.fillStyle = layer.color;
      ctx.save();
      ctx.scale(squish, 2 - squish);
      ctx.beginPath();
      ctx.ellipse(0, (2 + bob) / (2 - squish), layer.rx ?? 10, layer.ry ?? 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case "head": {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.ellipse(0, headY, layer.rx ?? 10, layer.ry ?? 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "ears": {
      if (layer.style === "pointed") {
        const sz = layer.size ?? 11;
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(-sz + 1, headY - 5);
        ctx.lineTo(-sz + 4, headY - 16);
        ctx.lineTo(-2, headY - 6);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(2, headY - 6);
        ctx.lineTo(sz - 4, headY - 16);
        ctx.lineTo(sz - 1, headY - 5);
        ctx.fill();
        ctx.fillStyle = layer.innerColor ?? "#FFAB91";
        ctx.beginPath();
        ctx.moveTo(-sz + 3, headY - 6);
        ctx.lineTo(-sz + 4.5, headY - 13);
        ctx.lineTo(-3, headY - 7);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(3, headY - 7);
        ctx.lineTo(sz - 4.5, headY - 13);
        ctx.lineTo(sz - 3, headY - 6);
        ctx.fill();
      } else if (layer.style === "comb") {
        // Chicken comb — three bumps on top of head
        const sz = layer.size ?? 6;
        ctx.fillStyle = layer.color ?? "#E53935";
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(i * (sz * 0.6), headY - 10 - Math.abs(i) * 2, sz * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // Wattle under beak
        ctx.fillStyle = layer.innerColor ?? layer.color ?? "#E53935";
        ctx.beginPath();
        ctx.ellipse(0, headY + 4, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const sz = layer.size ?? 4;
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.arc(-7, headY - 8, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(7, headY - 8, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = layer.innerColor ?? "#FFAB91";
        ctx.beginPath();
        ctx.arc(-7, headY - 8, sz / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(7, headY - 8, sz / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "eyes": {
      if (layer.style === "custom") {
        const sz = layer.size ?? 2.5;
        const spacing = layer.spacing ?? 4;
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.ellipse(-spacing, headY - 2, sz, sz + 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(spacing, headY - 2, sz, sz + 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        if (layer.pupilColor) {
          ctx.fillStyle = layer.pupilColor;
          ctx.beginPath();
          ctx.arc(-spacing, headY - 1.5, sz * 0.48, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(spacing, headY - 1.5, sz * 0.48, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        drawEyes(ctx, layer.color, 0, headY - 2, layer.size ?? 2.5, t);
      }
      break;
    }

    case "cheeks":
      drawCheeks(ctx, layer.color, 0, headY + 1);
      break;

    case "mouth": {
      const style = (isMoving && layer.movingStyle) ? layer.movingStyle : (layer.style ?? "smile");
      drawMouth(ctx, 0, headY + 5, style);
      break;
    }

    case "tail": {
      const sway = Math.sin(t / (layer.swaySpeed ?? 200)) * (layer.swayAmount ?? 6);
      if (layer.tailStyle === "fluffy") {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(8, 6 + bob);
        ctx.bezierCurveTo(16, 0 + bob + sway, 22, -10 + bob - sway, 18, -20 + bob);
        ctx.bezierCurveTo(14, -22 + bob + sway, 10, -16 + bob, 12, -8 + bob - sway);
        ctx.bezierCurveTo(10, -2 + bob + sway, 10, 4 + bob, 8, 6 + bob);
        ctx.fill();
        if (layer.highlightColor) {
          ctx.fillStyle = layer.highlightColor;
          ctx.beginPath();
          ctx.bezierCurveTo(14, -2 + bob + sway, 18, -12 + bob - sway, 16, -18 + bob);
          ctx.bezierCurveTo(14, -16 + bob, 12, -8 + bob, 10, -2 + bob);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = layer.color;
        ctx.beginPath();
        ctx.moveTo(10, 4 + bob);
        ctx.bezierCurveTo(18, -2 + bob + sway, 20, -14 + bob - sway, 14, -18 + bob + sway);
        ctx.bezierCurveTo(12, -14 + bob - sway, 14, -2 + bob + sway, 10, 4 + bob);
        ctx.fill();
      }
      break;
    }

    case "wings": {
      const speed = layer.speed ?? (layer.wingStyle === "flap" ? 200 : 250);
      ctx.fillStyle = layer.color;
      if (layer.wingStyle === "flutter") {
        const flutter = Math.sin(t / speed) * 3;
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
      } else {
        const flapAngle = isMoving ? Math.sin(t / speed) * 0.3 : 0.1;
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
      }
      break;
    }

    case "glow": {
      const alpha = (layer.baseAlpha ?? 0.08) + Math.sin(t / (layer.pulseSpeed ?? 600)) * (layer.alphaVar ?? 0.04);
      ctx.fillStyle = layer.color.replace(/[\d.]+\)$/, `${alpha})`);
      ctx.beginPath();
      ctx.ellipse(0, 2 + bob, layer.radius ?? 16, layer.radius ?? 16, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "sparkles": {
      const color = layer.color;
      const toRgba = (c: string, a: number) =>
        c.startsWith("rgba") ? c : `rgba(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}, ${a})`;

      if (layer.sparkleStyle === "star") {
        const speed = layer.speed ?? 400;
        const sparkleAlpha = 0.3 + Math.sin(t / speed) * 0.5;
        const sparkleSize = 2 + Math.sin(t / (speed * 0.75)) * 1;
        ctx.fillStyle = toRgba(color, sparkleAlpha);
        drawStar(ctx, 0, headY - 14, sparkleSize, 4);
      } else if (layer.sparkleStyle === "orbit") {
        const count = layer.count ?? 3;
        const speed = layer.speed ?? 800;
        for (let i = 0; i < count; i++) {
          const angle = (t / speed) + (i * Math.PI * 2) / count;
          const radius = 13 + Math.sin(t / (speed / 2) + i) * 2;
          const sx = Math.cos(angle) * radius;
          const sy = headY - 4 + Math.sin(angle) * 5;
          const alpha = 0.3 + Math.sin(t / (speed * 0.375) + i * 2) * 0.3;
          ctx.fillStyle = toRgba(color, alpha);
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const count = layer.count ?? 2;
        const speed = layer.speed ?? 600;
        for (let i = 0; i < count; i++) {
          const sx = Math.sin(t / speed + i * 3) * 16;
          const sy = -14 + Math.cos(t / (speed * 1.33) + i * 2) * 6 + bob;
          const sa = 0.2 + Math.sin(t / (speed * 0.67) + i * 5) * 0.3;
          ctx.fillStyle = toRgba(color, sa);
          drawStar(ctx, sx, sy, 2, 4);
        }
      }
      break;
    }

    case "patch": {
      ctx.fillStyle = layer.color ?? "#ECEFF1";
      ctx.beginPath();
      if (layer.position === "belly") {
        ctx.ellipse(0, 4 + bob, layer.rx ?? 5, layer.ry ?? 5, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(0, headY + 1, layer.rx ?? 7, layer.ry ?? 6, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }

    case "visor": {
      ctx.fillStyle = layer.bandColor;
      ctx.beginPath();
      ctx.roundRect(-10, headY - 4, 20, 6, 3);
      ctx.fill();
      const colors = layer.glowColors ?? ["#58A6FF", "#79C0FF", "#58A6FF"];
      const visorGrad = ctx.createLinearGradient(-8, headY - 3, 8, headY + 1);
      visorGrad.addColorStop(0, colors[0]);
      visorGrad.addColorStop(0.5, colors[1]);
      visorGrad.addColorStop(1, colors[2]);
      ctx.fillStyle = visorGrad;
      ctx.beginPath();
      ctx.roundRect(-8, headY - 3, 16, 4, 2);
      ctx.fill();
      if (layer.scan !== false) {
        const scanX = ((t / 15) % 24) - 12;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.roundRect(Math.max(-8, scanX), headY - 2.5, 4, 3, 1);
        ctx.fill();
      }
      break;
    }

    case "whiskers": {
      const count = layer.count ?? 3;
      const length = layer.length ?? 10;
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.7;
      for (const dir of [-1, 1]) {
        for (let i = 0; i < count; i++) {
          const offset = i - (count - 1) / 2;
          ctx.beginPath();
          ctx.moveTo(dir * 6, headY + 2 + offset * 2);
          ctx.lineTo(dir * (6 + length), headY + offset * 3);
          ctx.stroke();
        }
      }
      break;
    }

    case "beak": {
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-2, headY + 2);
      ctx.lineTo(0, headY + 6);
      ctx.lineTo(2, headY + 2);
      ctx.fill();
      break;
    }

    case "nose": {
      ctx.fillStyle = layer.color ?? "#5D4037";
      ctx.beginPath();
      ctx.ellipse(0, headY + 1, layer.rx ?? 2, layer.ry ?? 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "accessory": {
      if (layer.accessoryKind === "scarf") {
        ctx.fillStyle = layer.color ?? "#E53935";
        ctx.beginPath();
        ctx.roundRect(-8, headY + 6, 16, 4, 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(5, headY + 8, 4, 8, 2);
        ctx.fill();
      } else if (layer.accessoryKind === "idle-prop") {
        if (layer.idleOnly !== false && isMoving) break;
        ctx.fillStyle = layer.color ?? "#795548";
        ctx.beginPath();
        ctx.ellipse(6, 6 + bob, 3, 4, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4E342E";
        ctx.beginPath();
        ctx.roundRect(4, 2 + bob, 5, 3, 2);
        ctx.fill();
      } else if (layer.accessoryKind === "rider") {
        // Zombie rider sitting on top — like a chicken jockey
        const ry = headY - 20 + bob * 0.5;
        // Body
        ctx.fillStyle = layer.riderColor ?? "#4CAF50";
        ctx.beginPath();
        ctx.roundRect(-6, ry - 6, 12, 12, 3);
        ctx.fill();
        // Head/helmet
        ctx.fillStyle = layer.helmetColor ?? "#795548";
        ctx.beginPath();
        ctx.arc(0, ry - 11, 6, 0, Math.PI * 2);
        ctx.fill();
        // Face (green under helmet)
        ctx.fillStyle = layer.riderColor ?? "#4CAF50";
        ctx.beginPath();
        ctx.arc(0, ry - 9, 4, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = "#FFF";
        ctx.beginPath();
        ctx.arc(-2, ry - 10, 1.5, 0, Math.PI * 2);
        ctx.arc(2, ry - 10, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(-2, ry - 10, 0.8, 0, Math.PI * 2);
        ctx.arc(2, ry - 10, 0.8, 0, Math.PI * 2);
        ctx.fill();
        // Sword
        ctx.fillStyle = layer.swordColor ?? "#9E9E9E";
        ctx.beginPath();
        ctx.roundRect(7, ry - 16, 3, 20, 1);
        ctx.fill();
        ctx.fillStyle = "#795548";
        ctx.beginPath();
        ctx.roundRect(5, ry - 2, 8, 3, 1);
        ctx.fill();
      }
      break;
    }

    case "ghostBody": {
      const yBase = bob;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-12, 6 + yBase);
      ctx.lineTo(-12, -4 + yBase);
      ctx.quadraticCurveTo(-12, -16 + yBase, 0, -16 + yBase);
      ctx.quadraticCurveTo(12, -16 + yBase, 12, -4 + yBase);
      ctx.lineTo(12, 6 + yBase);
      const waves = layer.waves ?? 5;
      const waveHeight = layer.waveHeight ?? 6;
      for (let i = 0; i < waves; i++) {
        const wx = 12 - (i * 24) / waves;
        const wy = 6 + yBase + (i % 2 === 0 ? waveHeight : 0) + Math.sin(t / 300 + i) * 2;
        const nx = 12 - ((i + 1) * 24) / waves;
        ctx.quadraticCurveTo(wx - 24 / waves / 2, wy, nx, 6 + yBase + ((i + 1) % 2 === 0 ? waveHeight : 0));
      }
      ctx.closePath();
      ctx.fill();
      if (layer.shimmer !== false) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.ellipse(-3, -2 + yBase, 6, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
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
  style: "chat" | "thought" = "chat",
) {
  ctx.save();

  // Bubble background
  const padding = 6;
  ctx.font = "16px serif";
  const metrics = ctx.measureText(text);
  const width = metrics.width + padding * 2;
  const height = 24;

  const isThought = style === "thought";
  ctx.fillStyle = isThought
    ? "rgba(230, 220, 255, 0.92)"
    : "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height, width, height, 8);
  ctx.fill();

  if (isThought) {
    // Thought bubble: small circles instead of pointer
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Chat bubble: pointer triangle
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x + 4, y);
    ctx.fill();
  }

  // Text
  ctx.fillStyle = isThought ? "#555" : "#333";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - height / 2);

  ctx.restore();
}
