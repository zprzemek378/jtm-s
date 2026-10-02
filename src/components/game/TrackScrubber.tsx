import { useEffect, useRef, useState } from 'react'

import { SEEK_COMMIT_DELAY_MS, SEEK_STEP_MS } from '@/constants/spotify'
import { formatDuration } from '@/helpers/format'
import { useLanguage } from '@/i18n/useLanguage'
import { usePlaybackPosition } from '@/spotify/playback/usePlaybackPosition'
import { useSpotify } from '@/spotify/useSpotify'

import { Button } from '../ui/Button'
import { ButtonVariant } from '../ui/buttonVariant'
import styles from './TrackScrubber.module.scss'

/**
 * Where to look for the chorus, as fractions of the track.
 *
 * Spotify used to expose an audio analysis with the track's sections, from
 * which a chorus could be guessed; it has returned 403 for applications created
 * since late 2024, and there has never been a "most replayed" figure of the
 * kind YouTube shows. So this is a guess and nothing more: in most pop songs
 * the first chorus arrives around a third of the way in, with later ones around
 * the middle and the final third. Pressing again tries the next one, which
 * makes hunting for it a matter of three presses rather than a drag.
 */
const CHORUS_GUESSES = [0.3, 0.5, 0.7]

/**
 * Where the track has got to, and a handle to move it.
 *
 * Shown once a round is over and the song plays on under the answer, which is
 * when the table wants to hear a particular part rather than wherever the
 * snippet happened to land.
 */
type TrackScrubberProps = {
  /** Identifies the track, so the run of guesses starts over on a new one. */
  trackId: string
}

export function TrackScrubber({ trackId }: TrackScrubberProps) {
  const { t } = useLanguage()
  const { seek } = useSpotify()
  const { position, settle } = usePlaybackPosition(true)
  /** Where the handle is being held, while it is being held. */
  const [dragMs, setDragMs] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)
  const commitTimerRef = useRef<number | null>(null)

  // A round can end with a seek still waiting out its delay; it must not fire
  // into the next one.
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current)
      }
    },
    [],
  )
  /**
   * How many guesses have been tried, and for which track.
   *
   * The track is kept alongside the count rather than reset from an effect, so
   * a new round simply reads as "none tried yet" without a second render.
   */
  const [guesses, setGuesses] = useState({ trackId, tried: 0 })
  const tried = guesses.trackId === trackId ? guesses.tried : 0

  // Nothing is loaded yet, or the duration has not arrived: a slider with no
  // scale would only be something to fidget with.
  if (!position || position.durationMs <= 0) {
    return null
  }

  const shownMs = dragMs ?? position.positionMs

  const cancelPendingCommit = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
  }

  const commit = () => {
    cancelPendingCommit()

    const target = dragRef.current

    if (target === null) {
      return
    }

    dragRef.current = null
    setDragMs(null)
    settle(target)
    void seek(target)
  }

  /**
   * Moves the handle now and seeks once the host has finished moving it.
   *
   * Running the arrow keys along a track would otherwise be one request per
   * press. That is how a rate limit gets tripped, and the limit is charged to
   * the Client ID, so it would take everyone's evening with it.
   */
  const moveTo = (positionMs: number) => {
    const clamped = Math.min(position.durationMs, Math.max(0, positionMs))

    dragRef.current = clamped
    setDragMs(clamped)
    cancelPendingCommit()
    commitTimerRef.current = window.setTimeout(commit, SEEK_COMMIT_DELAY_MS)
  }

  const tryNextGuess = () => {
    const fraction = CHORUS_GUESSES[tried % CHORUS_GUESSES.length] ?? CHORUS_GUESSES[0]!
    const target = Math.round(position.durationMs * fraction)

    setGuesses({ trackId, tried: tried + 1 })
    settle(target)
    void seek(target)
  }

  return (
    <div className={styles.scrubber}>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={position.durationMs}
        step={1000}
        value={Math.round(shownMs)}
        aria-label={t('game.seek')}
        aria-valuetext={`${formatDuration(shownMs)} / ${formatDuration(position.durationMs)}`}
        onChange={(event) => moveTo(Number(event.target.value))}
        // The arrows move by a useful amount rather than by the slider's own
        // step, which would be a second at a time.
        onKeyDown={(event) => {
          const direction =
            event.key === 'ArrowRight' || event.key === 'ArrowUp'
              ? 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                ? -1
                : 0

          if (direction === 0) {
            return
          }

          event.preventDefault()
          moveTo((dragRef.current ?? position.positionMs) + direction * SEEK_STEP_MS)
        }}
        // Letting go is unambiguous, so it seeks at once instead of waiting out
        // the delay a keypress needs.
        onPointerUp={commit}
        onBlur={commit}
      />
      <p className={styles.readout}>
        <span>{formatDuration(shownMs)}</span>
        <span className={styles.total}>{formatDuration(position.durationMs)}</span>
      </p>

      <div className={styles.guessRow}>
        <Button variant={ButtonVariant.Secondary} onClick={tryNextGuess}>
          {t('game.chorusGuess')}
        </Button>
        <span className={styles.guessHint}>{t('game.chorusGuessHint')}</span>
      </div>
    </div>
  )
}
