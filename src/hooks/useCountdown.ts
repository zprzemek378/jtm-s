import { useEffect, useRef, useState } from 'react'

/** How often the remaining time is recomputed. */
const TICK_MS = 100

type CountdownOptions = {
  durationMs: number
  /** While false the countdown sits at its full duration. */
  active: boolean
  /**
   * Changing this restarts the countdown — typically the round number, so a new
   * round always gets a full window even if the duration is unchanged.
   */
  runKey: string | number
  onElapsed?: () => void
}

type Tick = {
  /** Which run this reading belongs to; a stale one is ignored. */
  key: string | number
  remainingMs: number
}

/**
 * Time left, counted against a wall-clock deadline rather than by accumulating
 * ticks, so a busy tab cannot make a round last longer than it should.
 */
export function useCountdown({ durationMs, active, runKey, onElapsed }: CountdownOptions): number {
  const [tick, setTick] = useState<Tick>({ key: runKey, remainingMs: durationMs })
  const onElapsedRef = useRef(onElapsed)

  useEffect(() => {
    onElapsedRef.current = onElapsed
  }, [onElapsed])

  useEffect(() => {
    if (!active) {
      return
    }

    const deadline = Date.now() + durationMs

    const interval = setInterval(() => {
      const left = deadline - Date.now()

      if (left > 0) {
        setTick({ key: runKey, remainingMs: left })

        return
      }

      setTick({ key: runKey, remainingMs: 0 })
      clearInterval(interval)
      onElapsedRef.current?.()
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [active, durationMs, runKey])

  // Readings from a finished run must not leak into the next one, and an
  // inactive countdown always shows its full window.
  return active && tick.key === runKey ? tick.remainingMs : durationMs
}
