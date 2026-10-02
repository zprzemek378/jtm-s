import { useEffect, useRef } from 'react'

import type { GamePlayer, PlayerId } from '@/game/types'
import { isTextEntryTarget } from '@/helpers/keys'
import { pressTime } from '@/helpers/keyboardLog'

/**
 * Listens on the whole document for the players' keys.
 *
 * Auto-repeat is ignored, so holding a key down buzzes once, and a matching key
 * has its default action suppressed — `/` would otherwise open the browser's
 * quick find and steal the round.
 */
export function useBuzzerKeys(
  players: readonly GamePlayer[],
  active: boolean,
  /**
   * `at` is the event's own timestamp, not the moment the handler ran — the
   * only record precise enough to tell two simultaneous presses apart.
   */
  onBuzz: (playerId: PlayerId, at: number) => void,
): void {
  const onBuzzRef = useRef(onBuzz)

  useEffect(() => {
    onBuzzRef.current = onBuzz
  }, [onBuzz])

  useEffect(() => {
    if (!active) {
      return
    }

    const byKeyCode = new Map(players.map((player) => [player.keyCode, player.id]))

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      // Never hijack a key while somebody is typing into a field. A slider or a
      // checkbox is not typing, so those must not silence the game.
      if (isTextEntryTarget(event.target)) {
        return
      }

      const playerId = byKeyCode.get(event.code)

      if (playerId === undefined) {
        return
      }

      event.preventDefault()
      onBuzzRef.current(playerId, pressTime(event.timeStamp, performance.now()).at)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, players])
}
