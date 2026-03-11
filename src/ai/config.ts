export type GameMode = "human" | "ai";
export type AIDifficulty = "easy" | "medium" | "hard";

export const AI_DIFFICULTY_SETTINGS: Record<
  AIDifficulty,
  {
    label: string;
    skillLevel: number;
    movetimeMs: number;
  }
> = {
  easy: {
    label: "Easy",
    skillLevel: 3,
    movetimeMs: 300,
  },
  medium: {
    label: "Medium",
    skillLevel: 12,
    movetimeMs: 800,
  },
  hard: {
    label: "Hard",
    skillLevel: 20,
    movetimeMs: 2000,
  },
};

export const AI_MOVE_DELAY_MS = 220;
