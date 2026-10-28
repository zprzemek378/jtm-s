// Fetching a track's lyrics, once per track.
//
// The hook is given the track as soon as the round starts, so the words are
// already in hand by the time the title is revealed and the panel appears. The
// request is to LRCLIB rather than Spotify, so it costs the game nothing and
// cannot delay a round: when it fails, the panel simply says so.

import { useEffect, useState } from "react";

import { LYRICS_CACHE_LIMIT } from "@/constants/lyrics";
import type { PlayableTrack } from "@/spotify/types";

import { fetchLyrics } from "./lrclib";
import { LyricsStatus, type Lyrics, type LyricsReadout } from "./types";

export { LyricsStatus, type LyricsReadout };

const IDLE: LyricsReadout = { status: LyricsStatus.Idle, lyrics: null };

/**
 * Tracks already looked up, kept for as long as the tab lives.
 *
 * A game never draws the same track twice, but a second game with the same
 * playlists can, and so can the host replaying one from history. Only answers
 * are remembered: a failure says nothing about the track and is worth retrying.
 */
const cache = new Map<string, Lyrics | null>();

function remember(trackId: string, lyrics: Lyrics | null): void {
  if (cache.size >= LYRICS_CACHE_LIMIT) {
    const oldest = cache.keys().next();

    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }

  cache.set(trackId, lyrics);
}

export function useLyrics(track: PlayableTrack | null, enabled: boolean): LyricsReadout {
  const [readout, setReadout] = useState<LyricsReadout>(IDLE);

  useEffect(() => {
    if (!enabled || !track) {
      // Clearing the previous track's words is the point; there is no
      // render-time value to derive this from.
      // oxlint-disable-next-line react/set-state-in-effect
      setReadout(IDLE);

      return;
    }

    const cached = cache.get(track.id);

    if (cached !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect
      setReadout({
        status: cached ? LyricsStatus.Ready : LyricsStatus.Missing,
        lyrics: cached,
      });

      return;
    }

    const controller = new AbortController();

    // oxlint-disable-next-line react/set-state-in-effect
    setReadout({ status: LyricsStatus.Loading, lyrics: null });

    const lookUp = async () => {
      try {
        const found = await fetchLyrics(track, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        remember(track.id, found);
        setReadout({
          status: found ? LyricsStatus.Ready : LyricsStatus.Missing,
          lyrics: found,
        });
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setReadout({ status: LyricsStatus.Failed, lyrics: null });
      }
    };

    void lookUp();

    return () => controller.abort();
  }, [enabled, track]);

  return readout;
}
