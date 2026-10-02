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
  strictImportMetaEnv: unknown
}

/**
 * Merged into the interface Vite declares, which already covers `BASE_URL`,
 * `MODE`, `DEV`, `PROD` and `SSR`.
 */
interface ImportMetaEnv {
  /**
   * Up to five Spotify applications to choose between in Settings, each a
   * 32-character Client ID. Gaps are fine, and an entry of the wrong shape is
   * ignored rather than offered.
   */
  readonly VITE_SPOTIFY_CLIENT_ID_1?: string
  readonly VITE_SPOTIFY_CLIENT_ID_2?: string
  readonly VITE_SPOTIFY_CLIENT_ID_3?: string
  readonly VITE_SPOTIFY_CLIENT_ID_4?: string
  readonly VITE_SPOTIFY_CLIENT_ID_5?: string

  /** What each of those applications is called on screen. Optional. */
  readonly VITE_SPOTIFY_CLIENT_NAME_1?: string
  readonly VITE_SPOTIFY_CLIENT_NAME_2?: string
  readonly VITE_SPOTIFY_CLIENT_NAME_3?: string
  readonly VITE_SPOTIFY_CLIENT_NAME_4?: string
  readonly VITE_SPOTIFY_CLIENT_NAME_5?: string
}
