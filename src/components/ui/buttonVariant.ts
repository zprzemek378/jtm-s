export const ButtonVariant = {
  Primary: "primary",
  Secondary: "secondary",
  Ghost: "ghost",
  /** The "correct answer" verdict. */
  Positive: "positive",
  /** The "wrong answer" verdict. */
  Negative: "negative",
} as const;

export type ButtonVariant = (typeof ButtonVariant)[keyof typeof ButtonVariant];
