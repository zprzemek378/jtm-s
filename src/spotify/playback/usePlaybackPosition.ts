// A moving read-out of where the current track has got to.
//
// The SDK reports a position only when asked, and the answer is a snapshot
// rather than a ticking clock. Asking several times a second would be wasteful
// and still jittery, so the position is re-read about once a second and the
// gaps in between are filled in from the local clock.

import { useCallback, useEffect, useRef, useState } from "react";

import type { PlaybackPosition } from "../types";
import { useSpotify } from "../useSpotify";

/** How often the SDK is asked again, to correct any drift. */
const SYNC_INTERVAL_MS = 1000;
/** How often the displayed figure is recomputed between those reads. */
const TICK_INTERVAL_MS = 200;

export type PlaybackReadout = {
  position: PlaybackPosition | null;
  /**
   * Tells the read-out where a seek has just landed.
   *
   * A seek takes a moment to take effect, and until it has, the SDK still
   * reports the old position — which would drag the handle back to where it was
   * dragged from. This moves the read-out at once and ignores the SDK until it
   * has caught up.
   */
  settle: (positionMs: number) => void;
};

export function usePlaybackPosition(active: boolean): PlaybackReadout {
  const { readPlayback } = useSpotify();
  const [position, setPosition] = useState<PlaybackPosition | null>(null);
  /** The last answer from the SDK, and when it arrived. */
  const anchorRef = useRef<(PlaybackPosition & { at: number }) | null>(null);
  /** Until when to ignore the SDK, because a seek is still settling. */
  const holdUntilRef = useRef(0);

  useEffect(() => {
    if (!active) {
      anchorRef.current = null;
      // Clearing a stale read-out is the point of switching off, and there is
      // no render-time value to derive it from.
      // oxlint-disable-next-line react/set-state-in-effect
      setPosition(null);

      return;
    }

    let cancelled = false;

    const sync = async () => {
      const read = await readPlayback();

      if (cancelled || !read || performance.now() < holdUntilRef.current) {
        return;
      }

      anchorRef.current = { ...read, at: performance.now() };
    };

    void sync();
    const syncTimer = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);

    const tickTimer = window.setInterval(() => {
      const anchor = anchorRef.current;

      if (!anchor) {
        return;
      }

      const elapsed = anchor.paused ? 0 : performance.now() - anchor.at;

      setPosition({
        positionMs: Math.min(anchor.durationMs, anchor.positionMs + elapsed),
        durationMs: anchor.durationMs,
        paused: anchor.paused,
      });
    }, TICK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(syncTimer);
      window.clearInterval(tickTimer);
    };
  }, [active, readPlayback]);

  const settle = useCallback((positionMs: number) => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    holdUntilRef.current = performance.now() + SYNC_INTERVAL_MS;
    anchorRef.current = { ...anchor, positionMs, at: performance.now() };
    setPosition({ ...anchor, positionMs });
  }, []);

  return { position, settle };
}
