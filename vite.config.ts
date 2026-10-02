import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * GitHub Pages serves 404.html for any path it cannot find and performs no SPA
 * rewrite, so a deep link such as /game would otherwise fail. Shipping the app
 * as 404.html too makes the router pick the route up from the URL.
 */
function githubPagesSpaFallback(): Plugin {
  let outDir = 'dist'

  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      copyFileSync(`${outDir}/index.html`, `${outDir}/404.html`)
    },
  }
}

/**
 * Read rather than imported, because a JSON import would need an assertion that
 * sits awkwardly with this project's TypeScript settings. `package.json` stays
 * the single place a version number is written down; everything else, including
 * the git tag, follows from it.
 */
const { version } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

/**
 * When this version came into being, as an ISO timestamp.
 *
 * Taken from the commit its tag points at, not from the clock: republishing an
 * older version to recover from a bad one must still show when that version was
 * made, otherwise the date would say "today" for code that is a week old.
 *
 * Falls back to the current commit, which during a deployment is the release
 * commit itself, and then to nothing at all — a working tree with no git
 * history still has to build.
 */
function versionDate(): string {
  for (const ref of [`v${version}`, 'HEAD']) {
    try {
      const stamp = execFileSync('git', ['log', '-1', '--format=%cI', ref], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()

      if (stamp) {
        return stamp
      }
    } catch {
      // No such tag, or not a git checkout. Try the next one.
    }
  }

  return ''
}

export default defineConfig({
  // Substituted into the bundle at build time, so the running app can show the
  // version it was actually built from.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_VERSION_DATE__: JSON.stringify(versionDate()),
  },
  // A project page lives under /<repo>/, so CI passes VITE_BASE.
  // Local dev and local builds stay at the root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), githubPagesSpaFallback()],
  server: {
    // Spotify rejects `localhost` in redirect URIs and accepts the loopback
    // address instead, so dev has to be reachable at http://127.0.0.1:5173.
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    /**
     * Audio is always emitted as its own file, never inlined into the bundle.
     *
     * Vite inlines small assets as base64 by default, and the placeholder
     * sounds are small enough to qualify — which would put them in the
     * JavaScript and, worse, take away the content hash that guarantees a
     * replaced sound is never served from a stale cache.
     */
    assetsInlineLimit: (filePath: string) =>
      /\.(mp3|ogg|wav|m4a)$/i.test(filePath) ? false : undefined,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // The styles directory is on the load path, so any .scss file
        // can simply write `@use 'core'`.
        loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))],
        // Variables, mixins and functions available in every .scss file.
        additionalData: "@use 'core' as *;\n",
      },
    },
  },
})
