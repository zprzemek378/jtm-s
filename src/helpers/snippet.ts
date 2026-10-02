import { SNIPPET_SKIP_END_MS, SNIPPET_SKIP_START_MS } from '@/constants/gameRules'

/**
 * Picks the millisecond a snippet starts at: anywhere in the track except the
 * opening bars and the fade-out, both of which give the title away too easily
 * or contain no music at all.
 *
 * `random` is injectable so the choice can be tested.
 */
export function pickSnippetStartMs(durationMs: number, random: () => number = Math.random): number {
  const earliest = SNIPPET_SKIP_START_MS
  const latest = durationMs - SNIPPET_SKIP_END_MS

  // Too short to honour both exclusions — start as late as the track allows,
  // which is still better than replaying the intro.
  if (latest <= earliest) {
    return Math.max(0, Math.floor(Math.min(earliest, durationMs / 2)))
  }

  return Math.floor(earliest + random() * (latest - earliest))
}
