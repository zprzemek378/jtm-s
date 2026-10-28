import { visibleLineCount } from "@/game/lyricsRound";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./LyricsRound.module.scss";

type LyricsRoundProps = {
  /** The whole file, already stripped of its blank lines. */
  lines: readonly string[];
  /** The line the round opened on. */
  from: number;
  /** How far into the round the clock has got. */
  elapsedMs: number;
  /**
   * How many lines to hold on screen, once the round has stopped revealing
   * them. Null while it still is.
   */
  frozenCount: number | null;
  /**
   * How many were already on screen when this stretch began — a lifeline
   * carries on from where the round left off rather than starting over.
   */
  startedAt?: number | null;
};

/**
 * A round with no music: the words arrive a line at a time.
 *
 * The newest line leads and the ones before it fade back, so the room can see
 * at a glance where the song has got to. Nothing new appears once somebody has
 * pressed — what they had to go on is what stays on screen.
 */
export function LyricsRound({
  lines,
  from,
  elapsedMs,
  frozenCount,
  startedAt = null,
}: LyricsRoundProps) {
  const { t } = useLanguage();
  const count = frozenCount ?? (startedAt ?? 1) + visibleLineCount(elapsedMs) - 1;
  const shown = lines.slice(from, from + count);

  return (
    <div className={styles.round}>
      <p className={styles.label}>{t("game.lyricsOnly")}</p>

      <div className={styles.lines} aria-live="off">
        {shown.map((line, index) => (
          <p
            key={from + index}
            className={index === shown.length - 1 ? `${styles.line} ${styles.newest}` : styles.line}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
