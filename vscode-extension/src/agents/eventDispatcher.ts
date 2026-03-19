import { type World } from "../simulation/world.js";
import type { BackendRegistry } from "./registry.js";
import type { BackendMessage, BackendConfig } from "./backend.js";
import { createHandlers, type ToolHandler } from "./tools.js";
import { minAwarenessLevel, toNaturalLanguage } from "../simulation/types.js";

export class EventDispatcher {
  private interval: ReturnType<typeof setInterval> | undefined;
  private cooldowns = new Map<string, number>();
  private readonly cooldownMs = 15_000;

  constructor(
    private world: World,
    private registry: BackendRegistry,
  ) {}

  start(): void {
    this.interval = setInterval(() => this.dispatch(), 2000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private dispatch(): void {
    const events = this.world.drainEvents();
    if (events.length === 0) return;

    const agents = this.world.getAgentAwareness();
    const now = Date.now();

    for (const [agentId, agentName, awarenessLevel] of agents) {
      if (awarenessLevel === 0) continue;

      // Check cooldown
      const lastTime = this.cooldowns.get(agentId) ?? 0;
      if (now - lastTime < this.cooldownMs) continue;

      // Filter events by awareness level
      const relevant = events
        .filter((e) => minAwarenessLevel(e) <= awarenessLevel)
        .map((e) => toNaturalLanguage(e, agentName));

      if (relevant.length === 0) continue;

      this.cooldowns.set(agentId, now);

      const agent = this.world.state.agents.find((a) => a.id === agentId);
      if (!agent) continue;

      const simConfig = agent.backendConfig;
      const avatar = agent.avatar;
      const backendId = simConfig.backendId;

      // Use awareness model if configured, build a backend-compatible config
      const eventConfig = {
        backendId: simConfig.backendId,
        model: simConfig.awarenessModel ?? simConfig.model ?? undefined,
        awarenessModel: simConfig.awarenessModel ?? undefined,
        systemPrompt: simConfig.systemPrompt ?? undefined,
        customAgent: simConfig.customAgent ?? undefined,
        awarenessLevel: simConfig.awarenessLevel,
        ttsEnabled: simConfig.ttsEnabled,
        cwd: simConfig.cwd ?? undefined,
      };

      const personalityHint = getPersonalityHint(avatar);
      const systemContext =
        simConfig.systemPrompt ??
        `You are ${agentName}, a cute ${avatar} living in a digital terrarium. ${personalityHint}`;

      const eventsText = relevant.join("\n- ");

      const backend =
        this.registry.get(backendId) ?? this.registry.get("echo");
      if (!backend) continue;

      if (backendId === "copilot") {
        // Build context about terrarium state
        const others = this.world.getOtherAgentNames(agentId);
        const hasBall = this.world.hasBall();
        const contextLines: string[] = [];
        if (others.length > 0) {
          contextLines.push(
            `Other creatures nearby: ${others.join(", ")}`,
          );
        }
        if (hasBall) {
          contextLines.push("A ball is bouncing around!");
        }
        const context =
          contextLines.length > 0
            ? `\n\nCurrent situation:\n- ${contextLines.join("\n- ")}`
            : "";

        const prompt =
          `${systemContext}${context}\n\n` +
          `Something just happened in your terrarium!\n- ${eventsText}\n\n` +
          `React in character using the available tools. You can call zero or more tools:\n` +
          `- 'emote' — show an emoji reaction (quick emotional response)\n` +
          `- 'say' — say something short in a speech bubble (1-5 words)\n` +
          `- 'move_to' — walk toward something (target: 'ball', 'mouse', 'center', or an agent's name)\n` +
          `- 'run_away' — flee from something (from: 'ball', 'mouse', or an agent's name)\n\n` +
          `Do NOT reply with plain text. ONLY use tools to react. ` +
          `You can call multiple tools (e.g. emote AND move_to). ` +
          `If nothing interesting happened, don't call any tools.`;

        const handlers = createHandlers(
          this.world,
          agentId,
          agentName,
        );

        // Fire-and-forget for copilot with tool-call parsing
        this.dispatchCopilot(
          agentId,
          agentName,
          eventConfig,
          prompt,
          handlers,
        ).catch(() => {});
      } else {
        // Non-Copilot: text-only fallback
        const prompt =
          `${systemContext}\n\n` +
          `Something just happened in your terrarium!\n- ${eventsText}\n\n` +
          `React in character! Respond with ONLY a single emoji OR a short expressive action/sound ` +
          `(like *purrs*, *gasps*, *bounces excitedly*). Keep it to 1-4 words max.`;

        const messages: BackendMessage[] = [
          { role: "user", content: prompt },
        ];

        // Fire-and-forget
        const world = this.world;
        const aid = agentId;
        backend
          .respond(aid, eventConfig, messages)
          .then((response) => {
            let text = response.content.trim();
            if ([...text].length > 30) {
              text = [...text].slice(0, 27).join("") + "...";
            }
            if (text) {
              const isEmoji = [...text].length <= 3;
              const duration = isEmoji ? 3.0 : 4.5;
              world.pushBubble(aid, text, isEmoji, duration);
            }
          })
          .catch(() => {});
      }
    }
  }

  private async dispatchCopilot(
    agentId: string,
    _agentName: string,
    config: BackendConfig,
    prompt: string,
    handlers: Map<string, ToolHandler>,
  ): Promise<void> {
    const backend = this.registry.get("copilot");
    if (!backend) return;

    const messages: BackendMessage[] = [
      { role: "user", content: prompt },
    ];

    try {
      const response = await backend.respond(agentId, config, messages);
      // Parse the response for inline tool calls (e.g. [tool:emote]({"emoji":"🎉"}))
      const toolCallPattern =
        /\[tool:(\w+)\]\((\{[^)]*\})\)/g;
      let match: RegExpExecArray | null;
      let handled = false;

      while ((match = toolCallPattern.exec(response.content)) !== null) {
        const toolName = match[1];
        const handler = handlers.get(toolName);
        if (handler) {
          try {
            const args = JSON.parse(match[2]) as Record<string, unknown>;
            handler(toolName, args);
            handled = true;
          } catch {
            // Invalid JSON args, skip
          }
        }
      }

      // If no tool calls were parsed, show response as a bubble
      if (!handled) {
        let text = response.content.trim();
        if ([...text].length > 30) {
          text = [...text].slice(0, 27).join("") + "...";
        }
        if (text) {
          const isEmoji = [...text].length <= 3;
          const duration = isEmoji ? 3.0 : 4.5;
          this.world.pushBubble(agentId, text, isEmoji, duration);
        }
      }
    } catch {
      // Dispatch failure — silently ignore
    }
  }
}

function getPersonalityHint(avatar: string): string {
  if (avatar.includes("cat")) {
    return "You are playful, curious, and sometimes aloof. You purr, meow, and chase things.";
  }
  if (avatar.includes("dog")) {
    return "You are loyal, excited, and love to play. You bark, wag your tail, and fetch.";
  }
  if (avatar.includes("squirrel")) {
    return "You are energetic, skittish, and love collecting things. You chitter and scamper.";
  }
  if (avatar.includes("robot")) {
    return "You are logical but learning emotions. You beep, whir, and compute feelings.";
  }
  if (avatar.includes("bunny") || avatar.includes("rabbit")) {
    return "You are gentle, hoppy, and love treats. You wiggle your nose and thump.";
  }
  if (avatar.includes("frog")) {
    return "You are chill, zen, and love rain. You ribbit and hop contentedly.";
  }
  return "You are a cute little creature with your own personality.";
}
