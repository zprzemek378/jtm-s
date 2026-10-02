export const ProgressTone = {
  Accent: "accent",
  /** Turns the bar red — used by the guessing countdown as it runs out. */
  Warning: "warning",
} as const;

export type ProgressTone = (typeof ProgressTone)[keyof typeof ProgressTone];
