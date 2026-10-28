import type { PooledTrack } from "@/helpers/trackUnion";
import type { LyricsReadout } from "@/lyrics/types";

import { KaraokePanel } from "./KaraokePanel";
import { SaveTrack } from "./SaveTrack";
import { TrackCard } from "./TrackCard";
import { TrackScrubber } from "./TrackScrubber";
import styles from "./AnswerBlock.module.scss";

type AnswerBlockProps = {
  track: PooledTrack;
  startPositionMs: number;
  lyrics: LyricsReadout;
  /** The handle to move the track, offered once the round is over. */
  scrubber?: boolean;
  /** How wide the screen lets this block be — the stage decides that. */
  className?: string;
};

/**
 * The answer and, beside it, the words.
 *
 * Shared by the three screens that name the track. They stack on a narrow
 * window and sit side by side once the stage is wide enough to hold both —
 * which depends on the stage, not the screen, because the sidebar collapses.
 */
export function AnswerBlock({
  track,
  startPositionMs,
  lyrics,
  scrubber = false,
  className,
}: AnswerBlockProps) {
  return (
    <div className={className ? `${styles.answer} ${className}` : styles.answer}>
      <div className={styles.main}>
        <TrackCard track={track} startPositionMs={startPositionMs} />
        {scrubber ? <TrackScrubber /> : null}
        <SaveTrack track={track} />
      </div>
      <KaraokePanel readout={lyrics} />
    </div>
  );
}
