// Color palettes for each agent avatar
export const AGENT_COLORS: Record<
  string,
  {
    body: string;
    head: string;
    eyes: string;
    accent: string;
    cheek: string;
  }
> = {
  cat: {
    body: "#FF9800",
    head: "#FFB74D",
    eyes: "#333",
    accent: "#E65100",
    cheek: "#FF8A80",
  },
  copilot: {
    body: "#1F6FEB",
    head: "#58A6FF",
    eyes: "#FFFFFF",
    accent: "#0D1117",
    cheek: "#90CAF9",
  },
  squirrel: {
    body: "#8D6E63",
    head: "#A1887F",
    eyes: "#333",
    accent: "#5D4037",
    cheek: "#FFAB91",
  },
  penguin: {
    body: "#37474F",
    head: "#455A64",
    eyes: "#333",
    accent: "#FF9800",
    cheek: "#F48FB1",
  },
  ghost: {
    body: "#E8EAF6",
    head: "#F5F5F5",
    eyes: "#7E57C2",
    accent: "#B39DDB",
    cheek: "#CE93D8",
  },
  robot: {
    body: "#78909C",
    head: "#90A4AE",
    eyes: "#4FC3F7",
    accent: "#455A64",
    cheek: "#80CBC4",
  },
};
