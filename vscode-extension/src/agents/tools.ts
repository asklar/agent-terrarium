import { type World } from "../simulation/world.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export function defineToolsJson(): ToolDefinition[] {
  return [
    {
      name: "say",
      description:
        "Say something out loud in a speech bubble. Use for short reactions, greetings, or comments.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "What to say (keep it very short, 1-5 words)",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "emote",
      description:
        "Show an emoji reaction above your head. Use for quick emotional reactions.",
      parameters: {
        type: "object",
        properties: {
          emoji: {
            type: "string",
            description: "A single emoji to display",
          },
        },
        required: ["emoji"],
      },
    },
    {
      name: "move_to",
      description: "Walk toward something in the terrarium.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description:
              "What to move toward: 'ball', 'mouse', 'center', or another agent's name",
          },
        },
        required: ["target"],
      },
    },
    {
      name: "run_away",
      description: "Run away from something in the terrarium.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description:
              "What to run from: 'ball', 'mouse', or another agent's name",
          },
        },
        required: ["from"],
      },
    },
  ];
}

export type ToolHandler = (toolName: string, args: Record<string, unknown>) => string;

export function createHandlers(
  world: World,
  agentId: string,
  _agentName: string,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("say", (_name, args) => {
    let text = typeof args.text === "string" ? args.text : "...";
    const display =
      [...text].length > 30 ? [...text].slice(0, 27).join("") + "..." : text;
    world.pushBubble(agentId, display, false, 10);
    return `You said: "${text}"`;
  });

  handlers.set("emote", (_name, args) => {
    const emoji = typeof args.emoji === "string" ? args.emoji : "😊";
    world.pushBubble(agentId, emoji, true, 3);
    return `You showed: ${emoji}`;
  });

  handlers.set("move_to", (_name, args) => {
    const target = typeof args.target === "string" ? args.target : "center";
    return world.moveToward(agentId, target);
  });

  handlers.set("run_away", (_name, args) => {
    const from = typeof args.from === "string" ? args.from : "ball";
    return world.moveAwayFrom(agentId, from);
  });

  return handlers;
}
