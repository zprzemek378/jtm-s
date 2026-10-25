import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguage } from "@/i18n/useLanguage";
import { activeLineIndex } from "@/lyrics/lrc";
import { LyricsKind } from "@/lyrics/types";
import { LyricsStatus, type LyricsReadout } from "@/lyrics/useLyrics";
import { usePlaybackPosition } from "@/spotify/playback/usePlaybackPosition";
import { useSpotify } from "@/spotify/useSpotify";

import { Button } from "../ui/Button";
import styles from "./KaraokePanel.module.scss";

type KaraokePanelProps = {
  readout: LyricsReadout;
};

/** How far a line may sit from the one being sung before it stops fading further. */
const FADE_STEPS = 3;

/** How long a smooth scroll of the panel's own may take to settle. */
const SELF_SCROLL_MS = 900;

/**
 * The words, once the answer is out.
 *
 * Only ever shown on the screens that already name the track: before that the
 * lyrics would be the answer. A timed file scrolls itself to the line being
 * sung, and any line can be clicked to send the music there. Scrolling by hand
 * takes the panel off the song until the host asks for it back, so reading
 * ahead does not fight the music.
 */
export function KaraokePanel({ readout }: KaraokePanelProps) {
  const { t } = useLanguage();
  const { seek } = useSpotify();
  const { position, settle } = usePlaybackPosition(true);
  const { status, lyrics } = readout;
  /** The window the song scrolls through, and the line to centre in it. */
  const viewportRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLParagraphElement>(null);
  /** Whether the panel still follows the music, or the host has scrolled away. */
  const [following, setFollowing] = useState(true);
  /** The first placing is a jump; every one after it slides. */
  const placedRef = useRef(false);
  /**
   * Until when a scroll is the panel's own doing.
   *
   * A smooth scroll arrives as a run of ordinary scroll events, which is also
   * exactly what the host's wheel produces. Only the clock tells them apart.
   */
  const selfScrollUntilRef = useRef(0);

  const lines = lyrics?.kind === LyricsKind.Synced ? lyrics.lines : null;
  const index = lines && position ? activeLineIndex(lines, position.positionMs) : -1;
  /** Before the first line is sung, the file is held at its opening line. */
  const anchorIndex = Math.max(index, 0);

  // Lines wrap, so no arithmetic on a line height can place the column: where
  // the anchor actually sits has to be read off the rendered element.
  const centreOnAnchor = useCallback((smooth: boolean) => {
    const viewport = viewportRef.current;
    const anchor = anchorRef.current;

    if (!viewport || !anchor) {
      return;
    }

    selfScrollUntilRef.current = performance.now() + SELF_SCROLL_MS;
    viewport.scrollTo({
      top: anchor.offsetTop + anchor.offsetHeight / 2 - viewport.clientHeight / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // A new track means a new file: follow it from the top again.
  useEffect(() => {
    placedRef.current = false;
    // Resuming the follow is the point of a new file arriving.
    // oxlint-disable-next-line react/set-state-in-effect
    setFollowing(true);
  }, [lines]);

  useEffect(() => {
    if (!following) {
      return;
    }

    centreOnAnchor(placedRef.current);
    placedRef.current = true;
  }, [centreOnAnchor, following, anchorIndex, lines]);

  // The panel moves beside the track card on a wide stage and back under it on
  // a narrow one, which rewraps every line and moves the anchor with it.
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (following) {
        centreOnAnchor(false);
      }
    });
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [centreOnAnchor, following, lines]);

  if (status === LyricsStatus.Idle) {
    return null;
  }

  const header = (resync: boolean) => (
    <div className={styles.header}>
      <p className={styles.label}>
        <span aria-hidden="true">♪</span> {t("game.karaoke")}
      </p>
      {resync && !following ? (
        <Button small onClick={() => setFollowing(true)}>
          {t("game.karaokeResync")}
        </Button>
      ) : null}
    </div>
  );

  if (!lyrics) {
    const note =
      status === LyricsStatus.Loading
        ? "game.karaokeLoading"
        : status === LyricsStatus.Failed
          ? "game.karaokeFailed"
          : "game.karaokeMissing";

    return (
      <div className={styles.panel}>
        {header(false)}
        <p className={styles.note}>{t(note)}</p>
      </div>
    );
  }

  if (lyrics.kind === LyricsKind.Plain) {
    return (
      <div className={styles.panel}>
        {header(false)}
        <div className={styles.plainViewport}>
          <p className={styles.plain}>{lyrics.text}</p>
        </div>
      </div>
    );
  }

  /** Sends the music to a line, and takes the panel back onto the song. */
  const jumpTo = (atMs: number) => {
    settle(atMs);
    setFollowing(true);
    void seek(atMs);
  };

  return (
    <div className={styles.panel}>
      {header(true)}
      {/* The lines change every few seconds while the track plays on, which is
          nothing a screen reader should be made to announce. */}
      <div
        className={styles.viewport}
        ref={viewportRef}
        aria-live="off"
        // A scroll the panel did not perform is the host reading rather than
        // following, so the panel stops pulling the words back until asked.
        onScroll={() => {
          if (performance.now() >= selfScrollUntilRef.current) {
            setFollowing(false);
          }
        }}
      >
        <div className={styles.column}>
          {lyrics.lines.map((line, lineIndex) => {
            const current = lineIndex === index;
            // Never zero: a line at no distance at all is the current one.
            const step = Math.max(1, Math.min(Math.abs(lineIndex - index), FADE_STEPS));

            return (
              <p
                key={lineIndex}
                ref={lineIndex === anchorIndex ? anchorRef : null}
                className={
                  current
                    ? `${styles.line} ${styles.current}`
                    : `${styles.line} ${styles[`fade${step}`]}`
                }
              >
                <button
                  type="button"
                  className={styles.jump}
                  title={t("game.karaokeJump")}
                  // Out of the tab order on purpose: a file is a hundred lines,
                  // and the host reaches the game's own buttons by keyboard.
                  tabIndex={-1}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    jumpTo(line.atMs);
                  }}
                >
                  {/* An empty line is a break in the singing — the file's own
                      way of clearing the screen. Something holds the height. */}
                  {line.text === "" ? <span className={styles.rest}>♪</span> : line.text}
                </button>
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
