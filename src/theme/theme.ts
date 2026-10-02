export const Theme = {
  Light: "light",
  Dark: "dark",
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

export function isTheme(value: unknown): value is Theme {
  return value === Theme.Light || value === Theme.Dark;
}
