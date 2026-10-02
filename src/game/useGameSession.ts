// Wires the pure round rules to real playback: draws a track, starts it at a
// random point, and pauses or resumes Spotify as the phase changes.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { playSound } from '@/audio/player'
import { SoundEvent } from '@/constants/soundChoices'
import { BUZZ_COLLECTION_MAX_MS, BUZZ_COLLECTION_MS, PRE_ROLL_MS } from '@/constants/gameRules'
import { useBuzzerKeys } from '@/hooks/useBuzzerKeys'
import { useCountdown } from '@/hooks/useCountdown'
import { drawFromPool } from '@/helpers/trackPool'
import { pickSnippetStartMs } from '@/helpers/snippet'
import type { Accounts } from '@/helpers/money'
import type { PooledTrack } from '@/helpers/trackUnion'
import { useSpotify } from '@/spotify/useSpotify'

import { createGameState, gameReducer, type GameState } from './gameState'
import { readPlayedTracks, writePlayedTracks } from './playHistory'
import { drawDirection, moneyAt } from './rewards'
import { canBuzz } from './gameState'
import { resolveBuzz, type BuzzEntry } from './tie'
import { GamePhase, type GamePlayer, type GameRules, type PlayerId, type Verdict } from './types'

export type GameSession = {
  state: GameState
  /** Milliseconds left in the guessing window; full while not listening. */
  guessRemainingMs: number
  /** True while a track is being started on the Spotify device. */
  loadingTrack: boolean
  /** Set when starting a track failed, so the host can retry instead of waiting. */
  startFailed: boolean
  /** True from the moment the host starts a round until the music is playing. */
  preRollActive: boolean
  /** Milliseconds left of the "get ready" countdown. */
  preRollRemainingMs: number
  /** The stake as it stands right now — what a buzz would capture. */
  currentMoney: number
  buzz: (playerId: PlayerId, at: number) => void
  reveal: () => void
  judge: (verdict: Verdict) => void
  /** Counts the table in, then plays the next track. */
  nextRound: () => void
  /** Starts over with the same players, target and playlist. */
  restart: () => void
  /** Edit mode: rewrites the standings between rounds. */
  applyEdit: (accounts: Accounts, suspendedNext: readonly PlayerId[]) => void
}

export function useGameSession(
  players: readonly GamePlayer[],
  rules: GameRules,
  tracks: readonly PooledTrack[],
  /**
   * Identifies the playlist selection, so a series of games played on the same
   * playlists keeps its history — and a different selection starts afresh.
   */
  historyKey: string,
): GameSession {
  const { playTrackAt, pause, resume } = useSpotify()
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    // Seeded from storage, so returning to the setup screen and starting again
    // does not bring the already-heard songs back.
    () => createGameState(players, rules, tracks, readPlayedTracks(historyKey)),
  )

  useEffect(() => {
    writePlayedTracks(historyKey, state.playedIds)
  }, [historyKey, state.playedIds])
  const [loadingTrack, setLoadingTrack] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  /**
   * Identifies the current "get ready" countdown, or null when none is running.
   * A fresh number each time, so a new count-in always starts from the top.
   */
  const [preRollKey, setPreRollKey] = useState<number | null>(null)
  const preRollCounterRef = useRef(0)
  /** Stops the auto-advance effect from starting two rounds at once. */
  const startingRef = useRef(false)

  const startRound = useCallback(async () => {
    if (startingRef.current) {
      return
    }

    startingRef.current = true
    setLoadingTrack(true)
    setStartFailed(false)

    try {
      const draw = drawFromPool(state.pool, tracks)

      // Nothing at all to play. Reported as a failed start so the screen waits
      // for the host: the count-in that led here fires whenever the game is
      // idle, so returning quietly would loop it for ever.
      if (!draw) {
        setStartFailed(true)

        return
      }

      const startPositionMs = pickSnippetStartMs(draw.item.durationMs)
      // Drawn out here, so the random mode never reaches the pure reducer.
      const direction = drawDirection(rules.mode, state.round + 1)

      // Playback starts first, so the countdown on screen matches the music.
      await playTrackAt(draw.item.uri, startPositionMs)
      dispatch({
        type: 'start-round',
        track: draw.item,
        startPositionMs,
        pool: draw.remaining,
        direction,
      })
    } catch {
      // Spotify can refuse to play — the account started listening elsewhere,
      // or the device dropped out. Let the host retry rather than sit on a
      // spinner that will never resolve.
      setStartFailed(true)
    } finally {
      setLoadingTrack(false)
      setPreRollKey(null)
      startingRef.current = false
    }
  }, [playTrackAt, rules.mode, state.pool, state.round, tracks])

  const preRollRemainingMs = useCountdown({
    durationMs: PRE_ROLL_MS,
    active: preRollKey !== null,
    runKey: preRollKey ?? -1,
    onElapsed: useCallback(() => {
      void startRound()
    }, [startRound]),
  })

  const nextRound = useCallback(() => {
    // A timed-out round leaves its track playing, so it has to be silenced
    // before the count-in — otherwise the old song runs under "3, 2, 1".
    void pause()

    // This only counts the table in; the round begins when it runs out.
    preRollCounterRef.current += 1
    setPreRollKey(preRollCounterRef.current)
  }, [pause])

  // `idle` means a game that has been set up but has not played a round yet —
  // the opening round and a rematch. Both are counted in, exactly like every
  // later round, so nobody is caught out by the first song of the evening.
  // Every other round is started by the host, from the timed-out or the verdict
  // screen; a failed attempt waits for the host too, so this cannot spin.
  useEffect(() => {
    if (state.phase === GamePhase.Idle && !startFailed && preRollKey === null) {
      // oxlint-disable-next-line react/set-state-in-effect
      nextRound()
    }
  }, [nextRound, preRollKey, startFailed, state.phase])

  const guessRemainingMs = useCountdown({
    durationMs: rules.roundDurationMs,
    active: state.phase === GamePhase.Listening,
    runKey: state.round,
    onElapsed: useCallback(() => dispatch({ type: 'guess-window-elapsed' }), []),
  })

  // Derived from the very value the screen is showing, so a player captures
  // exactly the figure they were looking at when they hit their key.
  const currentMoney = moneyAt(
    state.direction,
    rules.roundDurationMs - guessRemainingMs,
    rules.roundDurationMs,
  )

  /**
   * Presses in flight, waiting to be judged against the tie threshold. Held in
   * a ref because they arrive between renders and must not trigger any.
   */
  const burstRef = useRef<{
    entries: BuzzEntry[]
    amount: number
    timer: number
    openedAt: number
    resolve: () => void
  } | null>(null)

  useEffect(
    () => () => {
      if (burstRef.current) {
        clearTimeout(burstRef.current.timer)
        burstRef.current = null
      }
    },
    [],
  )

  /**
   * How long to gather presses for. One keyboard poll is enough for genuinely
   * simultaneous presses; a larger threshold needs a correspondingly larger
   * window, or the rule would be cut short by the mechanism rather than by the
   * number the host chose.
   */
  const collectionMs = Math.min(
    BUZZ_COLLECTION_MAX_MS,
    Math.max(BUZZ_COLLECTION_MS, (rules.tieThresholdMs ?? 0) + BUZZ_COLLECTION_MS),
  )

  const buzz = useCallback(
    (playerId: PlayerId, at: number) => {
      // Ties switched off: the first press wins outright, as it always did.
      if (rules.tieThresholdMs === null) {
        playSound(SoundEvent.Buzz)
        dispatch({ type: 'buzz', playerId, amount: currentMoney })

        return
      }

      // A player sitting the round out must not be able to drag anyone into a
      // tie: the reducer refuses their buzz, so their press cannot count here
      // either.
      if (!canBuzz(state, playerId)) {
        return
      }

      const burst = burstRef.current

      if (burst) {
        burst.entries.push({ playerId, at })

        // Each further press restarts the window, so a chain of presses can
        // keep growing — the same rule the tie itself follows. The cap stops
        // somebody hammering a key from holding the round open for ever.
        if (performance.now() - burst.openedAt < BUZZ_COLLECTION_MAX_MS) {
          clearTimeout(burst.timer)
          burst.timer = window.setTimeout(burst.resolve, collectionMs)
        }

        return
      }

      // Sounded from the press itself rather than from the phase it eventually
      // produces. The phase waits for the collection window to close — which is
      // the point of that window — and the room should hear the buzz the moment
      // somebody hits their key, not once the tie has been worked out.
      playSound(SoundEvent.Buzz)

      // The threshold is a fraction of a millisecond, so it cannot be waited
      // out. Instead the presses are gathered for one keyboard poll and then
      // compared by their own timestamps.
      const entries: BuzzEntry[] = [{ playerId, at }]
      const amount = currentMoney
      const resolve = () => {
        burstRef.current = null

        // Resolved from the array this closure owns rather than from the ref:
        // if anything ever clears or replaces the ref mid-window, the presses
        // already collected still count.
        const outcome = resolveBuzz(entries, rules.tieThresholdMs)

        if (outcome?.kind === 'tie') {
          dispatch({ type: 'tie', playerIds: outcome.playerIds })
        } else if (outcome?.kind === 'single') {
          dispatch({ type: 'buzz', playerId: outcome.playerId, amount })
        }
      }

      // The stake is frozen at the first press, not at the end of the window.
      burstRef.current = {
        entries,
        amount,
        timer: window.setTimeout(resolve, collectionMs),
        openedAt: performance.now(),
        resolve,
      }
    },
    [collectionMs, currentMoney, rules.tieThresholdMs, state],
  )

  // Only a buzz stops the music. When the window simply runs out the track
  // keeps playing under the revealed title, so the table hears the song they
  // failed to name — it stops on its own when the next round starts.
  useEffect(() => {
    if (state.phase === GamePhase.Buzzed) {
      void pause()
    }
  }, [pause, state.phase])

  useEffect(() => {
    if (state.phase === GamePhase.Finished) {
      void pause()
    }
  }, [pause, state.phase])

  const reveal = useCallback(() => {
    dispatch({ type: 'reveal' })
    // Picks the snippet up where it was paused.
    void resume()
  }, [resume])

  const judge = useCallback((verdict: Verdict) => {
    // The track plays on under the verdict, as it does when nobody guessed;
    // `nextRound` is what silences it.
    dispatch({ type: 'judge', verdict })
  }, [])

  const restart = useCallback(() => {
    dispatch({ type: 'reset', players, rules, tracks })
  }, [players, rules, tracks])

  const applyEdit = useCallback((accounts: Accounts, suspendedNext: readonly PlayerId[]) => {
    dispatch({ type: 'apply-edit', accounts, suspendedNext })
  }, [])

  useBuzzerKeys(players, state.phase === GamePhase.Listening, buzz)

  return {
    state,
    guessRemainingMs,
    loadingTrack,
    startFailed,
    preRollActive: preRollKey !== null,
    preRollRemainingMs,
    currentMoney,
    buzz,
    reveal,
    judge,
    nextRound,
    restart,
    applyEdit,
  }
}
