import { useEffect } from 'react'

/**
 * Grabs the next key the host presses, for assigning a player's buzzer.
 *
 * Capture phase and `preventDefault` together stop the key from also reaching
 * the page, so assigning Tab or `/` cannot move focus or open quick find.
 * Escape cancels instead of being assigned.
 */
export function useKeyCapture(
  capturing: boolean,
  onCapture: (keyCode: string) => void,
  onCancel: () => void,
): void {
  useEffect(() => {
    if (!capturing) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.code === 'Escape') {
        onCancel()

        return
      }

      onCapture(event.code)
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [capturing, onCancel, onCapture])
}
