import {
  Vec2,
  AgentState,
  MovementStyle,
  Direction,
  type Personality,
  type Agent,
  type Ball,
  type DroppedFile,
  type ChatBubble,
  type ChatMessage,
  type ChatSession,
  type WorldState,
  type AgentConfig,
  type AppConfig,
  type BackendConfig,
  type TerrariumEvent,
  defaultBackendConfig,
} from "./types";

// ── Constants ───────────────────────────────────────────────────────────────

export const TICK_RATE = 1.0 / 20.0; // 20 ticks/sec
export const INTERACTION_DISTANCE = 60.0;
export const INTERACTION_COOLDOWN = 5.0;
export const BALL_FRICTION = 0.99;
export const BALL_MIN_SPEED = 0.5;
export const BALL_GRAVITY = 400.0; // px/sec² downward
export const BALL_BOUNCE_DAMPING = 0.6;
export const WANDER_TARGET_MARGIN = 10.0;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function randF64(): number {
  return Math.random();
}

export function pickEmoji(emojis: string[]): string {
  if (emojis.length === 0) {
    return "❓";
  }
  const idx = Math.floor(randF64() * emojis.length);
  return emojis[Math.min(idx, emojis.length - 1)];
}

export function pickNewTarget(agent: Agent, bounds: Vec2, groundY: number): void {
  const margin = 32.0;
  const minY =
    agent.personality.movementStyle === MovementStyle.Float
      ? groundY * 0.3
      : groundY;
  agent.target = Vec2.new(
    margin + randF64() * (bounds.x - margin * 2.0),
    minY + randF64() * (bounds.y - minY - margin),
  );
  agent.stateTimer = 3.0 + randF64() * 5.0;
}

// ── createAgent factory ─────────────────────────────────────────────────────

export function createAgent(
  id: string,
  name: string,
  avatar: string,
  bounds: Vec2,
  groundY: number,
): Agent {
  const groundMid = groundY + (bounds.y - groundY) * 0.5;

  let personality: Personality;
  let yPos: number;

  switch (avatar) {
    case "cat":
      personality = {
        speedMin: 30.0,
        speedMax: 120.0,
        movementStyle: MovementStyle.Wander,
        interactionChance: 0.7,
        ballInterest: 0.9,
        chatEmojis: ["😺", "😻", "🐱", "✨", "💕"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
    case "copilot":
      personality = {
        speedMin: 25.0,
        speedMax: 80.0,
        movementStyle: MovementStyle.Patrol,
        interactionChance: 0.8,
        ballInterest: 0.5,
        chatEmojis: ["✨", "💡", "🚀", "💻", "🤝"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
    case "squirrel":
      personality = {
        speedMin: 50.0,
        speedMax: 180.0,
        movementStyle: MovementStyle.Bounce,
        interactionChance: 0.6,
        ballInterest: 0.8,
        chatEmojis: ["🐿️", "🌰", "🍂", "😆", "💨"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
    case "penguin":
      personality = {
        speedMin: 15.0,
        speedMax: 40.0,
        movementStyle: MovementStyle.Wander,
        interactionChance: 0.5,
        ballInterest: 0.4,
        chatEmojis: ["🐧", "❄️", "🧊", "😊", "🐟"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
    case "ghost":
      personality = {
        speedMin: 10.0,
        speedMax: 50.0,
        movementStyle: MovementStyle.Float,
        interactionChance: 0.2,
        ballInterest: 0.1,
        chatEmojis: ["👻", "💀", "🌙", "✨", "😶"],
      };
      yPos = groundY * 0.5;
      break;
    case "clippy":
      personality = {
        speedMin: 20.0,
        speedMax: 100.0,
        movementStyle: MovementStyle.Wander,
        interactionChance: 0.95,
        ballInterest: 0.8,
        chatEmojis: ["📎", "💡", "❓", "✨", "👀"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
    default:
      personality = {
        speedMin: 20.0,
        speedMax: 80.0,
        movementStyle: MovementStyle.Wander,
        interactionChance: 0.5,
        ballInterest: 0.5,
        chatEmojis: ["😊", "👋", "✨"],
      };
      yPos = groundMid + randF64() * (bounds.y - groundMid - 32.0);
      break;
  }

  const xPos = 32.0 + randF64() * (bounds.x - 64.0);

  return {
    id,
    name,
    avatar,
    position: Vec2.new(xPos, yPos),
    velocity: Vec2.zero(),
    state: AgentState.Idle,
    direction: randF64() > 0.5 ? Direction.Right : Direction.Left,
    personality,
    target: null,
    stateTimer: 0.0,
    interactionCooldown: 0.0,
    gear: [],
    backendConfig:
      avatar === "copilot"
        ? { ...defaultBackendConfig(), backendId: "copilot" }
        : defaultBackendConfig(),
  };
}

// ── World ───────────────────────────────────────────────────────────────────

export class World {
  public state: WorldState;

  constructor(bounds: Vec2) {
    this.state = {
      agents: [],
      ball: null,
      droppedFiles: [],
      bubbles: [],
      chatSessions: [],
      bounds,
      groundYRatio: 0.72,
      tick: 0,
      mousePos: null,
      ballMaxCaptures: 3,
      ballKickOnCapture: true,
      attentionIntervalSecs: 5.0,
      events: [],
      pendingFiles: new Map(),
    };
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  tick(): void {
    const s = this.state;
    s.tick += 1;

    const bounds = s.bounds;
    const groundY = bounds.y * s.groundYRatio;
    const agentCount = s.agents.length;

    // Collect agent positions for interaction checks
    const positions: [string, Vec2][] = s.agents.map((a) => [a.id, a.position]);

    let ballCaptureAgent: number | null = null;
    let fileClaimAgent: [number, number] | null = null;

    // Pre-compute nearest unclaimed file for each agent
    const fileTargets: (number | null)[] = new Array(s.droppedFiles.length).fill(null);
    for (let fi = 0; fi < s.droppedFiles.length; fi++) {
      const file = s.droppedFiles[fi];
      if (!file.active || file.claimedBy !== null) {
        continue;
      }
      let bestDist = Infinity;
      let bestAgent: number | null = null;
      for (let ai = 0; ai < s.agents.length; ai++) {
        const agent = s.agents[ai];
        if (
          agent.state === AgentState.Chatting ||
          agent.state === AgentState.NeedsAttention ||
          agent.state === AgentState.Interacting ||
          agent.backendConfig.backendId === "echo"
        ) {
          continue;
        }
        const dist = agent.position.distanceTo(file.position);
        if (dist < bestDist) {
          bestDist = dist;
          bestAgent = ai;
        }
      }
      fileTargets[fi] = bestAgent;
    }

    for (let i = 0; i < agentCount; i++) {
      // Skip agents that are chatting or need attention
      if (
        s.agents[i].state === AgentState.Chatting ||
        s.agents[i].state === AgentState.NeedsAttention
      ) {
        continue;
      }

      // Update cooldowns
      s.agents[i].interactionCooldown = Math.max(
        s.agents[i].interactionCooldown - TICK_RATE,
        0.0,
      );
      s.agents[i].stateTimer -= TICK_RATE;

      // Check if chasing ball
      const ballPos =
        s.ball && s.ball.active ? s.ball.position : null;
      let chasingBall = false;
      if (ballPos !== null) {
        if (s.agents[i].personality.ballInterest > 0.3) {
          const dir = ballPos.sub(s.agents[i].position);
          const dist = dir.magnitude();
          if (dist > 15.0) {
            const speed =
              s.agents[i].personality.speedMax *
              s.agents[i].personality.ballInterest;
            s.agents[i].velocity = dir.normalized().mul(speed);
            s.agents[i].state = AgentState.Running;
            s.agents[i].direction =
              dir.x > 0.0 ? Direction.Right : Direction.Left;
            chasingBall = true;
          } else {
            // Agent reached the ball — record a capture
            if (ballCaptureAgent === null) {
              ballCaptureAgent = i;
            }
          }
        }
      }

      // Check if this agent should chase an unclaimed file
      let chasingFile = false;
      if (!chasingBall) {
        let targetFile: number | null = null;
        for (let fi = 0; fi < fileTargets.length; fi++) {
          if (fileTargets[fi] === i) {
            targetFile = fi;
            break;
          }
        }
        if (targetFile !== null) {
          const filePos = s.droppedFiles[targetFile].position;
          const dir = filePos.sub(s.agents[i].position);
          const dist = dir.magnitude();
          if (dist > 15.0) {
            const speed = s.agents[i].personality.speedMax * 0.6;
            s.agents[i].velocity = dir.normalized().mul(speed);
            s.agents[i].state = AgentState.Walking;
            s.agents[i].direction =
              dir.x > 0.0 ? Direction.Right : Direction.Left;
            chasingFile = true;
          } else {
            // Agent reached the file — claim it
            if (fileClaimAgent === null) {
              fileClaimAgent = [i, targetFile];
            }
          }
        }
      }

      if (
        !chasingBall &&
        !chasingFile &&
        s.agents[i].state !== AgentState.Interacting
      ) {
        // Wander behavior
        if (s.agents[i].target === null || s.agents[i].stateTimer <= 0.0) {
          pickNewTarget(s.agents[i], bounds, groundY);
        }

        const target = s.agents[i].target;
        if (target !== null) {
          const dir = target.sub(s.agents[i].position);
          const dist = dir.magnitude();
          if (dist < WANDER_TARGET_MARGIN) {
            s.agents[i].target = null;
            s.agents[i].velocity = Vec2.zero();
            s.agents[i].state = AgentState.Idle;
            s.agents[i].stateTimer = 1.0 + randF64() * 3.0;
          } else {
            const speed =
              s.agents[i].personality.speedMin +
              randF64() *
                (s.agents[i].personality.speedMax -
                  s.agents[i].personality.speedMin) *
                0.5;
            s.agents[i].velocity = dir.normalized().mul(speed);
            s.agents[i].state = AgentState.Walking;
            s.agents[i].direction =
              dir.x > 0.0 ? Direction.Right : Direction.Left;
          }
        }
      }

      // Update interaction timer
      if (s.agents[i].state === AgentState.Interacting) {
        if (s.agents[i].stateTimer <= 0.0) {
          s.agents[i].state = AgentState.Idle;
          s.agents[i].velocity = Vec2.zero();
          s.agents[i].stateTimer = 0.5 + randF64() * 1.0;
        } else {
          s.agents[i].velocity = Vec2.zero();
          continue;
        }
      }

      // Apply velocity with hover slowdown
      const mouse = s.mousePos;
      let speedScale = 1.0;
      if (mouse !== null) {
        const dist = s.agents[i].position.distanceTo(mouse);
        const slowdownRadius = 80.0;
        if (dist < slowdownRadius) {
          speedScale = 0.1 + 0.9 * (dist / slowdownRadius);
        }
      }
      const vel = s.agents[i].velocity.mul(speedScale);
      s.agents[i].position = s.agents[i].position.add(vel.mul(TICK_RATE));

      // Bounce off bounds
      if (s.agents[i].position.x < 16.0) {
        s.agents[i].position.x = 16.0;
        s.agents[i].velocity.x = Math.abs(s.agents[i].velocity.x);
        s.agents[i].direction = Direction.Right;
      }
      if (s.agents[i].position.x > bounds.x - 16.0) {
        s.agents[i].position.x = bounds.x - 16.0;
        s.agents[i].velocity.x = -Math.abs(s.agents[i].velocity.x);
        s.agents[i].direction = Direction.Left;
      }
      // Ghost can float above ground, others stay on ground plane
      const minY =
        s.agents[i].personality.movementStyle === MovementStyle.Float
          ? groundY * 0.3
          : groundY;
      if (s.agents[i].position.y < minY) {
        s.agents[i].position.y = minY;
        s.agents[i].velocity.y = Math.abs(s.agents[i].velocity.y);
      }
      if (s.agents[i].position.y > bounds.y - 16.0) {
        s.agents[i].position.y = bounds.y - 16.0;
        s.agents[i].velocity.y = -Math.abs(s.agents[i].velocity.y);
      }
    }

    // Check agent-agent interactions
    const newBubbles: ChatBubble[] = [];
    for (let i = 0; i < agentCount; i++) {
      for (let j = i + 1; j < agentCount; j++) {
        const dist = positions[i][1].distanceTo(positions[j][1]);
        if (dist < INTERACTION_DISTANCE) {
          if (
            s.agents[i].interactionCooldown <= 0.0 &&
            s.agents[j].interactionCooldown <= 0.0 &&
            s.agents[i].state !== AgentState.Chatting &&
            s.agents[j].state !== AgentState.Chatting &&
            s.agents[i].state !== AgentState.Interacting &&
            s.agents[j].state !== AgentState.Interacting &&
            s.agents[i].state !== AgentState.NeedsAttention &&
            s.agents[j].state !== AgentState.NeedsAttention
          ) {
            const chance =
              (s.agents[i].personality.interactionChance +
                s.agents[j].personality.interactionChance) /
              2.0;
            if (randF64() < chance * TICK_RATE) {
              const emojiA = pickEmoji(s.agents[i].personality.chatEmojis);
              const emojiB = pickEmoji(s.agents[j].personality.chatEmojis);
              const idA = s.agents[i].id;
              const idB = s.agents[j].id;
              const nameA = s.agents[i].name;
              const nameB = s.agents[j].name;

              newBubbles.push({
                agentId: idA,
                content: emojiA,
                timer: 2.5,
                isEmoji: true,
                isEvent: false,
              });
              newBubbles.push({
                agentId: idB,
                content: emojiB,
                timer: 2.5,
                isEmoji: true,
                isEvent: false,
              });

              s.events.push({
                type: "AgentInteraction",
                agentA: nameA,
                agentB: nameB,
                emoji: emojiA,
              });

              s.agents[i].state = AgentState.Interacting;
              s.agents[i].stateTimer = 2.5;
              s.agents[i].interactionCooldown = INTERACTION_COOLDOWN;
              s.agents[j].state = AgentState.Interacting;
              s.agents[j].stateTimer = 2.5;
              s.agents[j].interactionCooldown = INTERACTION_COOLDOWN;
            }
          }
        }
      }
    }
    s.bubbles.push(...newBubbles);

    // Handle ball capture by agent
    if (ballCaptureAgent !== null) {
      const agentIdx = ballCaptureAgent;
      const maxCaptures = s.ballMaxCaptures;
      const kick = s.ballKickOnCapture;
      const agentId = s.agents[agentIdx].id;
      const agentPos = s.agents[agentIdx].position;
      const agentDir = s.agents[agentIdx].direction;
      const tick = s.tick;
      let didCapture = false;
      if (s.ball && s.ball.active) {
        s.ball.captures += 1;
        didCapture = true;
        if (s.ball.captures >= maxCaptures) {
          s.ball.active = false;
          s.ball.height = 0.0;
          s.ball.heightVelocity = 0.0;
        } else if (kick) {
          const kickDirX = agentDir === Direction.Right ? 1.0 : -1.0;
          const variation = ((tick % 7) - 3.0) * 0.15;
          const kickSpeed = 200.0 + (tick % 5) * 30.0;
          const kickVy = 40.0 + (tick % 6) * 20.0;
          s.ball.velocity = Vec2.new(
            kickDirX * kickSpeed * (1.0 + variation),
            kickVy,
          );
          s.ball.position = agentPos.add(Vec2.new(kickDirX * 20.0, 0.0));
          s.ball.height = 10.0;
          s.ball.heightVelocity = 150.0 + (tick % 4) * 25.0;
        }
      }
      if (didCapture) {
        const agentName = s.agents[agentIdx].name;
        s.events.push({ type: "BallCaught", agentName });
        if (s.ball && !s.ball.active) {
          s.events.push({ type: "BallGone" });
        }
        const emojis = ["⚽", "🎉", "😄", "🏆", "💪", "🙌"];
        const emoji = emojis[tick % emojis.length];
        s.bubbles.push({
          agentId,
          content: emoji,
          timer: 2.0,
          isEmoji: true,
          isEvent: false,
        });
      }
    }

    // Handle file claim by agent
    if (fileClaimAgent !== null) {
      const [agentIdx, fileIdx] = fileClaimAgent;
      const agentId = s.agents[agentIdx].id;
      const agentName = s.agents[agentIdx].name;
      const fileLabel = s.droppedFiles[fileIdx].label;
      s.droppedFiles[fileIdx].claimedBy = agentId;
      s.events.push({
        type: "FileClaimed",
        agentName,
        fileName: fileLabel,
      });
      const emojis = ["📄", "📦", "📂", "🗂️", "📋", "🤓"];
      const emoji = emojis[s.tick % emojis.length];
      s.bubbles.push({
        agentId,
        content: emoji,
        timer: 2.5,
        isEmoji: true,
        isEvent: false,
      });
    }

    // Update dropped file physics (gravity + bounce)
    for (const file of s.droppedFiles) {
      if (!file.active || file.claimedBy !== null) {
        continue;
      }
      if (file.height > 0.0 || Math.abs(file.heightVelocity) > 0.1) {
        file.heightVelocity -= BALL_GRAVITY * TICK_RATE;
        file.height += file.heightVelocity * TICK_RATE;
        if (file.height < 0.0) {
          file.height = 0.0;
          file.heightVelocity = Math.abs(file.heightVelocity) * 0.3; // gentle bounce
          if (file.heightVelocity < 3.0) {
            file.heightVelocity = 0.0;
          }
        }
      }
    }

    // Update ball physics
    if (s.ball && s.ball.active) {
      const ball = s.ball;
      // Apply gravity to height
      ball.heightVelocity -= BALL_GRAVITY * TICK_RATE;
      ball.height += ball.heightVelocity * TICK_RATE;

      // Horizontal movement
      ball.position.x += ball.velocity.x * TICK_RATE;
      ball.velocity.x *= BALL_FRICTION;

      // Depth movement (along ground plane)
      ball.position.y += ball.velocity.y * TICK_RATE;
      ball.velocity.y *= BALL_FRICTION;

      // Bounce off left/right walls
      if (ball.position.x < 8.0 || ball.position.x > bounds.x - 8.0) {
        ball.velocity.x = -ball.velocity.x * BALL_BOUNCE_DAMPING;
        ball.position.x = Math.max(8.0, Math.min(ball.position.x, bounds.x - 8.0));
      }
      // Clamp depth to ground plane
      if (ball.position.y < groundY) {
        ball.position.y = groundY;
        ball.velocity.y = Math.abs(ball.velocity.y) * BALL_BOUNCE_DAMPING;
      }
      if (ball.position.y > bounds.y - 8.0) {
        ball.position.y = bounds.y - 8.0;
        ball.velocity.y = -Math.abs(ball.velocity.y) * BALL_BOUNCE_DAMPING;
      }
      // Bounce off ground
      if (ball.height < 0.0) {
        ball.heightVelocity = Math.abs(ball.heightVelocity) * BALL_BOUNCE_DAMPING;
        ball.height = 0.0;
        // Extra horizontal friction on ground contact
        ball.velocity.x *= 0.92;
        ball.velocity.y *= 0.92;
        // Kill tiny bounces
        if (ball.heightVelocity < 5.0) {
          ball.heightVelocity = 0.0;
        }
      }

      const totalSpeed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
      if (
        totalSpeed <= BALL_MIN_SPEED &&
        ball.height <= 0.0 &&
        Math.abs(ball.heightVelocity) <= BALL_MIN_SPEED
      ) {
        ball.active = false;
        ball.height = 0.0;
        ball.heightVelocity = 0.0;
      }
    }

    // Update bubble timers
    s.bubbles = s.bubbles.filter((bubble) => {
      bubble.timer -= TICK_RATE;
      return bubble.timer > 0.0;
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getState(): WorldState {
    // Return a reference; callers should treat as snapshot
    return this.state;
  }

  throwBall(x: number, y: number, vx: number, vy: number): void {
    const s = this.state;
    const groundY = s.bounds.y * s.groundYRatio;
    const boundsY = s.bounds.y;

    if (y >= groundY) {
      s.ball = {
        position: Vec2.new(x, Math.min(y, boundsY - 8.0)),
        velocity: Vec2.new(vx, vy),
        active: true,
        captures: 0,
        height: 10.0,
        heightVelocity: 0.0,
      };
    } else {
      const depthY = vy > 0.0
        ? (() => {
            const groundRange = boundsY - groundY;
            const depthFraction = Math.min(vy / 500.0, 1.0);
            return groundY + depthFraction * groundRange * 0.8;
          })()
        : groundY + 20.0;
      const initialHeight = groundY - y;
      s.ball = {
        position: Vec2.new(x, Math.min(depthY, boundsY - 8.0)),
        velocity: Vec2.new(vx, 0.0),
        active: true,
        captures: 0,
        height: initialHeight + 10.0,
        heightVelocity: 0.0,
      };
    }
    s.events.push({ type: "BallThrown" });
  }

  dropFiles(files: [string, string][], x: number, y: number): string {
    const s = this.state;
    const label =
      files.length === 1
        ? files[0][0]
        : `${files[0][0]} + ${files.length - 1} files`;

    const groundY = s.bounds.y * s.groundYRatio;
    const boundsY = s.bounds.y;

    const posX = Math.max(16.0, Math.min(x, s.bounds.x - 16.0));
    const depthY = y < groundY ? groundY + 20.0 : Math.min(y, boundsY - 16.0);
    const initialHeight = y < groundY ? groundY - y : 10.0;
    const id = `file_${s.tick}`;

    s.droppedFiles.push({
      id,
      label,
      files,
      iconDataUrl: null,
      position: Vec2.new(posX, depthY),
      claimedBy: null,
      active: true,
      height: initialHeight,
      heightVelocity: 0.0,
    });
    s.events.push({ type: "FileDropped", fileName: label });
    return id;
  }

  detachFile(agentId: string): [string, string][] | null {
    const s = this.state;
    let result: [string, string][] | null = null;
    for (const file of s.droppedFiles) {
      if (file.active && file.claimedBy === agentId) {
        file.active = false;
        result = file.files;
      }
    }
    s.droppedFiles = s.droppedFiles.filter((f) => f.active);
    return result;
  }

  getClaimedFiles(agentId: string): [string, string][] | null {
    const file = this.state.droppedFiles.find(
      (f) => f.active && f.claimedBy === agentId,
    );
    return file ? file.files : null;
  }

  removeDroppedFile(fileId: string): void {
    this.state.droppedFiles = this.state.droppedFiles.filter(
      (f) => f.id !== fileId,
    );
  }

  setPendingFiles(agentId: string, files: [string, string][]): void {
    if (files.length === 0) {
      this.state.pendingFiles.delete(agentId);
    } else {
      this.state.pendingFiles.set(agentId, files);
    }
  }

  clearPendingFiles(agentId: string): void {
    this.state.pendingFiles.delete(agentId);
  }

  getPendingFiles(agentId: string): [string, string][] {
    return this.state.pendingFiles.get(agentId) ?? [];
  }

  clickAgent(agentId: string, restoredMessages?: ChatMessage[]): boolean {
    const s = this.state;
    const agent = s.agents.find((a) => a.id === agentId);
    if (!agent) {
      return false;
    }
    const agentName = agent.name;
    agent.state = AgentState.Chatting;
    agent.velocity = Vec2.zero();

    const session = s.chatSessions.find((ss) => ss.agentId === agentId);
    if (session) {
      session.active = true;
    } else {
      s.chatSessions.push({
        agentId,
        messages: restoredMessages ?? [],
        active: true,
      });
    }
    s.events.push({ type: "UserClickedAgent", agentName });
    return true;
  }

  dismissChat(agentId: string): void {
    const s = this.state;
    const agent = s.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.state = AgentState.Idle;
      agent.stateTimer = 1.0;
    }
    const session = s.chatSessions.find((ss) => ss.agentId === agentId);
    if (session) {
      session.active = false;
    }
  }

  clearChat(agentId: string): void {
    const session = this.state.chatSessions.find(
      (ss) => ss.agentId === agentId,
    );
    if (session) {
      session.messages = [];
    }
  }

  addUserMessage(agentId: string, text: string): BackendConfig | null {
    const s = this.state;
    const backendConfig =
      s.agents.find((a) => a.id === agentId)?.backendConfig ?? null;

    const session = s.chatSessions.find((ss) => ss.agentId === agentId);
    if (session) {
      session.messages.push({ fromUser: true, text });
    }

    return backendConfig;
  }

  completeResponse(agentId: string, response: string): void {
    const session = this.state.chatSessions.find(
      (ss) => ss.agentId === agentId,
    );
    if (session) {
      session.messages.push({ fromUser: false, text: response });
    }
  }

  getChatMessages(agentId: string): ChatMessage[] {
    const session = this.state.chatSessions.find(
      (ss) => ss.agentId === agentId,
    );
    return session ? [...session.messages] : [];
  }

  resize(width: number, height: number): void {
    const s = this.state;
    const oldGroundY = s.bounds.y * s.groundYRatio;
    s.bounds = Vec2.new(width, height);
    const newGroundY = s.bounds.y * s.groundYRatio;

    // Reposition agents to the new ground line
    for (const agent of s.agents) {
      const dy = agent.position.y - oldGroundY;
      agent.position = Vec2.new(
        Math.min(agent.position.x, width - 10),
        newGroundY + dy,
      );
      if (agent.target) {
        agent.target = Vec2.new(
          Math.min(agent.target.x, width - 10),
          newGroundY,
        );
      }
    }
  }

  addAgent(avatar: string, name: string): string {
    const s = this.state;
    const bounds = s.bounds;
    const groundY = bounds.y * s.groundYRatio;
    const id = `${avatar}_${s.tick}`;
    const agent = createAgent(id, name, avatar, bounds, groundY);
    s.events.push({ type: "AgentArrived", agentName: name });
    s.agents.push(agent);
    return id;
  }

  removeAgent(agentId: string): void {
    const s = this.state;
    const agent = s.agents.find((a) => a.id === agentId);
    if (agent) {
      s.events.push({ type: "AgentLeft", agentName: agent.name });
    }
    s.agents = s.agents.filter((a) => a.id !== agentId);
    s.chatSessions = s.chatSessions.filter((ss) => ss.agentId !== agentId);
    s.bubbles = s.bubbles.filter((b) => b.agentId !== agentId);
  }

  setGear(agentId: string, gearIds: string[]): void {
    const s = this.state;
    const agent = s.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.gear = gearIds;
    }
    const emojis = ["✨", "💅", "🎀", "👒", "😎", "🤩"];
    const tick = s.tick;
    const emoji = emojis[tick % emojis.length];
    s.bubbles.push({
      agentId,
      content: emoji,
      timer: 2.0,
      isEmoji: true,
      isEvent: false,
    });
  }

  requestAttention(agentId: string): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.state = AgentState.NeedsAttention;
      agent.velocity = Vec2.zero();
      agent.target = null;
    }
  }

  dismissAttention(agentId: string): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (agent && agent.state === AgentState.NeedsAttention) {
      agent.state = AgentState.Idle;
    }
  }

  renameAgent(agentId: string, name: string): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.name = name;
    }
  }

  moveToward(agentId: string, target: string): string {
    const s = this.state;
    const groundY = s.bounds.y * s.groundYRatio;

    let targetPos: Vec2 | null = null;
    switch (target) {
      case "ball":
        targetPos = s.ball ? s.ball.position : null;
        break;
      case "mouse":
      case "cursor":
        targetPos = s.mousePos;
        break;
      case "center":
        targetPos = Vec2.new(s.bounds.x / 2.0, groundY);
        break;
      default:
        // Find agent by name (case-insensitive)
        targetPos =
          s.agents.find(
            (a) =>
              a.id !== agentId &&
              a.name.toLowerCase() === target.toLowerCase(),
          )?.position ?? null;
        break;
    }

    if (targetPos !== null) {
      const agent = s.agents.find((a) => a.id === agentId);
      if (agent) {
        agent.target = targetPos;
        if (target === "ball") {
          agent.personality.ballInterest = 1.0;
          agent.state = AgentState.Running;
        } else {
          agent.state = AgentState.Walking;
        }
      }
      return `Moving toward ${target}!`;
    }
    return `Can't find '${target}' to move toward.`;
  }

  moveAwayFrom(agentId: string, target: string): string {
    const s = this.state;
    const groundY = s.bounds.y * s.groundYRatio;
    const boundsX = s.bounds.x;

    let targetPos: Vec2 | null = null;
    switch (target) {
      case "ball":
        targetPos = s.ball ? s.ball.position : null;
        break;
      case "mouse":
      case "cursor":
        targetPos = s.mousePos;
        break;
      default:
        targetPos =
          s.agents.find(
            (a) =>
              a.id !== agentId &&
              a.name.toLowerCase() === target.toLowerCase(),
          )?.position ?? null;
        break;
    }

    if (targetPos !== null) {
      const agent = s.agents.find((a) => a.id === agentId);
      if (agent) {
        const dx = agent.position.x - targetPos.x;
        const fleeX = Math.max(
          20.0,
          Math.min(agent.position.x + Math.sign(dx) * 150.0, boundsX - 20.0),
        );
        agent.target = Vec2.new(fleeX, groundY);
        agent.state = AgentState.Running;
      }
      return `Running away from ${target}!`;
    }
    return `Can't find '${target}' to run from.`;
  }

  pushBubble(
    agentId: string,
    content: string,
    isEmoji: boolean,
    duration: number,
  ): void {
    this.state.bubbles.push({
      agentId,
      content,
      timer: duration,
      isEmoji,
      isEvent: true,
    });
  }

  updateMouse(x: number | null, y: number | null): void {
    this.state.mousePos =
      x !== null && y !== null ? Vec2.new(x, y) : null;
  }

  setBackendConfig(agentId: string, config: BackendConfig): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.backendConfig = config;
    }
  }

  getAgentConfigs(): AgentConfig[] {
    return this.state.agents.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      personality: { ...a.personality },
      gear: [...a.gear],
      backendConfig: { ...a.backendConfig },
    }));
  }

  loadFromConfig(config: AppConfig): void {
    const s = this.state;
    const bounds = s.bounds;
    const groundY = bounds.y * s.groundYRatio;
    s.agents = [];
    s.chatSessions = [];
    s.bubbles = [];
    s.droppedFiles = [];
    s.ballMaxCaptures = config.ballMaxCaptures;
    s.ballKickOnCapture = config.ballKickOnCapture;
    s.attentionIntervalSecs = config.attentionIntervalSecs;
    for (const ac of config.agents) {
      const agent = createAgent(ac.id, ac.name, ac.avatar, bounds, groundY);
      if (ac.personality && Object.keys(ac.personality).length > 0) {
        agent.personality = { ...ac.personality };
      }
      agent.gear = [...ac.gear];
      if (ac.backendConfig && Object.keys(ac.backendConfig).length > 0) {
        agent.backendConfig = { ...ac.backendConfig };
      }
      s.agents.push(agent);
    }
  }

  drainEvents(): TerrariumEvent[] {
    const events = this.state.events;
    this.state.events = [];
    return events;
  }

  getAgentAwareness(): [string, string, number][] {
    return this.state.agents.map((a) => [
      a.id,
      a.name,
      a.backendConfig.awarenessLevel,
    ]);
  }

  getOtherAgentNames(agentId: string): string[] {
    return this.state.agents
      .filter((a) => a.id !== agentId)
      .map((a) => a.name);
  }

  hasBall(): boolean {
    return this.state.ball?.active ?? false;
  }
}
