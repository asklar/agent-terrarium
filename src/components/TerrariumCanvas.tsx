import { useRef, useEffect, useCallback, useState } from "react";
import type { WorldState, Agent } from "../types/world";
import { AGENT_COLORS } from "./AgentSprites";

interface TerrariumCanvasProps {
  worldState: WorldState | null;
  onAgentClick: (agentId: string) => void;
  onBallThrow: (x: number, y: number, vx: number, vy: number) => void;
  onBackgroundClick: () => void;
}

const AGENT_SIZE = 32;
const BALL_SIZE = 10;

export function TerrariumCanvas({
  worldState,
  onAgentClick,
  onBallThrow,
  onBackgroundClick,
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

      // Each agent has a unique voice profile
      const voices: Record<
        string,
        {
          basePitch: number;
          pitchVar: number;
          wave: OscillatorType;
          syllables: number;
          speed: number;
          volume: number;
        }
      > = {
        cat: {
          basePitch: 700,
          pitchVar: 150,
          wave: "triangle",
          syllables: 3,
          speed: 0.07,
          volume: 0.1,
        },
        copilot: {
          basePitch: 500,
          pitchVar: 80,
          wave: "sine",
          syllables: 4,
          speed: 0.06,
          volume: 0.08,
        },
        squirrel: {
          basePitch: 900,
          pitchVar: 200,
          wave: "triangle",
          syllables: 5,
          speed: 0.05,
          volume: 0.08,
        },
        penguin: {
          basePitch: 350,
          pitchVar: 60,
          wave: "sine",
          syllables: 2,
          speed: 0.1,
          volume: 0.1,
        },
        ghost: {
          basePitch: 280,
          pitchVar: 40,
          wave: "sine",
          syllables: 3,
          speed: 0.12,
          volume: 0.06,
        },
        robot: {
          basePitch: 400,
          pitchVar: 100,
          wave: "square",
          syllables: 3,
          speed: 0.08,
          volume: 0.05,
        },
      };
      const v = voices[agent.avatar] ?? voices.copilot;

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
      if (dragStart) {
        setDragCurrent(getCanvasPos(e));
        return;
      }

      // Hover detection for greeting bubbles
      const pos = getCanvasPos(e);
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
    [dragStart, getCanvasPos, findAgentAt, pickGreetingEmoji, playGreetingSound],
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
      }}
    />
  );
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent) {
  const { x, y } = agent.position;
  const colors = AGENT_COLORS[agent.avatar] || AGENT_COLORS.cat;
  const isMoving =
    agent.state === "Walking" ||
    agent.state === "Running" ||
    agent.state === "Sprinting";
  const flip = agent.direction === "Left";

  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(0, AGENT_SIZE / 2 - 2, AGENT_SIZE / 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body bob animation
  const bob = isMoving ? Math.sin(Date.now() / 100) * 2 : 0;

  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(
    -AGENT_SIZE / 4,
    -AGENT_SIZE / 4 + bob,
    AGENT_SIZE / 2,
    AGENT_SIZE / 2,
    6,
  );
  ctx.fill();

  // Head
  ctx.fillStyle = colors.head;
  ctx.beginPath();
  ctx.arc(0, -AGENT_SIZE / 4 + bob - 4, AGENT_SIZE / 4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const blinkFrame = Math.floor(Date.now() / 2000) % 10 === 0;
  ctx.fillStyle = colors.eyes;
  if (!blinkFrame) {
    ctx.beginPath();
    ctx.arc(-4, -AGENT_SIZE / 4 + bob - 6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -AGENT_SIZE / 4 + bob - 6, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-6, -AGENT_SIZE / 4 + bob - 7, 4, 1);
    ctx.fillRect(2, -AGENT_SIZE / 4 + bob - 7, 4, 1);
  }

  // Agent-specific details
  drawAgentDetails(ctx, agent.avatar, bob);

  // State indicator
  if (agent.state === "Interacting") {
    ctx.fillStyle = "rgba(255, 235, 59, 0.6)";
    ctx.beginPath();
    ctx.arc(0, -AGENT_SIZE / 2 - 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name tag
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  if (flip) ctx.scale(-1, 1);
  ctx.fillText(agent.name, 0, AGENT_SIZE / 2 + 10);

  ctx.restore();
}

function drawAgentDetails(
  ctx: CanvasRenderingContext2D,
  avatar: string,
  bob: number,
) {
  switch (avatar) {
    case "cat":
      // Ears
      ctx.fillStyle = AGENT_COLORS.cat.head;
      ctx.beginPath();
      ctx.moveTo(-8, -AGENT_SIZE / 4 - 12 + bob);
      ctx.lineTo(-4, -AGENT_SIZE / 4 - 20 + bob);
      ctx.lineTo(0, -AGENT_SIZE / 4 - 12 + bob);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -AGENT_SIZE / 4 - 12 + bob);
      ctx.lineTo(4, -AGENT_SIZE / 4 - 20 + bob);
      ctx.lineTo(8, -AGENT_SIZE / 4 - 12 + bob);
      ctx.fill();
      break;
    case "robot":
      // Antenna
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -AGENT_SIZE / 4 - 12 + bob);
      ctx.lineTo(0, -AGENT_SIZE / 4 - 20 + bob);
      ctx.stroke();
      ctx.fillStyle = "#FF0000";
      ctx.beginPath();
      ctx.arc(0, -AGENT_SIZE / 4 - 20 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "copilot": {
      // Copilot visor / headset shape
      const hy = -AGENT_SIZE / 4 + bob;
      // Visor band
      ctx.fillStyle = "#0D1117";
      ctx.beginPath();
      ctx.roundRect(-9, hy - 10, 18, 7, 3);
      ctx.fill();
      // Visor glow
      ctx.fillStyle = "#58A6FF";
      ctx.beginPath();
      ctx.roundRect(-7, hy - 9, 14, 5, 2);
      ctx.fill();
      // Sparkle on top (animated)
      const sparklePhase = (Date.now() / 400) % (Math.PI * 2);
      const sparkleAlpha = 0.4 + Math.sin(sparklePhase) * 0.4;
      ctx.fillStyle = `rgba(88, 166, 255, ${sparkleAlpha})`;
      ctx.beginPath();
      ctx.arc(0, hy - 16, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Small wing/cape accent
      ctx.fillStyle = "rgba(31, 111, 235, 0.5)";
      ctx.beginPath();
      ctx.moveTo(-8, 2 + bob);
      ctx.quadraticCurveTo(-14, 6 + bob, -10, 12 + bob);
      ctx.lineTo(-6, 8 + bob);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, 2 + bob);
      ctx.quadraticCurveTo(14, 6 + bob, 10, 12 + bob);
      ctx.lineTo(6, 8 + bob);
      ctx.fill();
      break;
    }
    case "squirrel":
      // Tail
      ctx.fillStyle = AGENT_COLORS.squirrel.body;
      ctx.beginPath();
      ctx.moveTo(8, 0 + bob);
      ctx.quadraticCurveTo(16, -8 + bob, 12, -16 + bob);
      ctx.quadraticCurveTo(8, -12 + bob, 8, 0 + bob);
      ctx.fill();
      break;
    case "penguin":
      // Belly
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.ellipse(0, 2 + bob, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ghost":
      // Wavy bottom
      ctx.fillStyle = AGENT_COLORS.ghost.body;
      const waveY = AGENT_SIZE / 4 + bob;
      ctx.beginPath();
      ctx.moveTo(-AGENT_SIZE / 4, waveY);
      for (let i = 0; i < 4; i++) {
        const cx = -AGENT_SIZE / 4 + (i * AGENT_SIZE) / 8 + AGENT_SIZE / 16;
        const cy = waveY + (i % 2 === 0 ? 4 : -2);
        ctx.quadraticCurveTo(
          cx,
          cy,
          -AGENT_SIZE / 4 + ((i + 1) * AGENT_SIZE) / 8,
          waveY,
        );
      }
      ctx.fill();
      break;
  }
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
