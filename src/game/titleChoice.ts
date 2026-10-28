// The six titles a player chooses from when they spend that lifeline.
//
// Pure, so the drawing rules can be checked on their own: the right answer is
// always among them, the wrong ones come from the same playlist wherever the
// game has enough of them, and no two options read the same.

import { TITLE_OPTIONS } from "@/constants/gameRules";
import type { PooledTrack } from "@/helpers/trackUnion";

/** One of the six, identified rather than compared by name. */
export type TitleOption = {
  trackId: string;
  name: string;
};

/** Titles differing only in case or spacing would read as the same option. */
function sameTitle(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function shareAPlaylist(track: PooledTrack, other: PooledTrack): boolean {
  return track.playlistIds.some((id) => other.playlistIds.includes(id));
}

/**
 * The correct title plus five wrong ones, shuffled.
 *
 * Neighbours on the same playlist make a far better round than five songs
 * pulled from wherever: the choice should be between things that could
 * plausibly have been playing. Only when there are not enough of those does it
 * reach into the rest of the pool.
 */
export function pickTitleOptions(
  correct: PooledTrack,
  tracks: readonly PooledTrack[],
  random: () => number = Math.random,
): readonly TitleOption[] {
  const taken = [correct.name];
  const usable = tracks.filter(
    (track) => track.id !== correct.id && !sameTitle(track.name, correct.name),
  );

  const neighbours = usable.filter((track) => shareAPlaylist(track, correct));
  const strangers = usable.filter((track) => !shareAPlaylist(track, correct));
  const wrong: PooledTrack[] = [];

  for (const source of [neighbours, strangers]) {
    const pool = [...source];

    while (wrong.length < TITLE_OPTIONS - 1 && pool.length > 0) {
      const [candidate] = pool.splice(Math.floor(random() * pool.length), 1);

      // Two options reading the same would make one of them unanswerable.
      if (!taken.some((name) => sameTitle(name, candidate.name))) {
        taken.push(candidate.name);
        wrong.push(candidate);
      }
    }
  }

  const options = [correct, ...wrong].map((track) => ({ trackId: track.id, name: track.name }));

  // A shuffle that moves every place, rather than one that tends to leave the
  // first entry where it started — the answer must not sit at the top.
  for (let at = options.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    [options[at], options[swap]] = [options[swap], options[at]];
  }

  return options;
}
