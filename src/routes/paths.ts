/** All application paths in one place — used by the router and the navigation. */
export const ROUTES = {
  home: "/",
  game: "/game",
  settings: "/settings",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
