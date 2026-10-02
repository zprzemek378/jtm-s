/// <reference types="vite/client" />

/**
 * Turns off Vite's `[key: string]: any` fallback for `import.meta.env`.
 *
 * Without this, every name is allowed and a mistyped variable compiles cleanly,
 * then reads as undefined at runtime — which for a Client ID means the game
 * simply claims to be unconfigured, with nothing pointing at the typo. With it,
 * only the variables declared below exist, so the compiler catches the slip.
 */
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

/**
 * Merged into the interface Vite declares, which already covers `BASE_URL`,
 * `MODE`, `DEV`, `PROD` and `SSR`.
 */
interface ImportMetaEnv {
  // The Spotify applications are deliberately absent. They are numbered from
  // 1 upwards with no ceiling, which no interface can enumerate, so
  // `auth/clientId.ts` reads them from the environment object by name. Nothing
  // else in the application reaches for them directly.
}

/** The version from `package.json`, substituted in by Vite at build time. */
declare const __APP_VERSION__: string;

/**
 * When that version was made, as an ISO timestamp, or empty when it could not
 * be worked out. Read from git while building, so republishing an older version
 * still shows the day it was released rather than the day it was republished.
 */
declare const __APP_VERSION_DATE__: string;
