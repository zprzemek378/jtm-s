import { useCallback, useEffect, useRef, useState } from "react";

import { ACTION_KEY_COOLDOWN_MS, TOO_SOON_FLASH_MS } from "@/constants/gameRules";
import { isTextEntryTarget } from "@/helpers/keys";

/**
 * Keyboard shortcuts for the host's own controls during a round.
 *
 * These are separate from the players' buzzers: the keys here are the ones
 * `RESERVED_KEY_CODES` keeps out of players' hands, so a shortcut can never
 * collide with somebody's buzzer.
 */
export type ActionKeys = {
  /** Enter, the keypad's Enter and Space — the "yes, go on" keys. */
  onConfirm?: () => void;
  /** Backspace — kept apart, so rejecting an answer cannot be a slip. */
  onReject?: () => void;
};

const CONFIRM_CODES = ["Enter", "NumpadEnter", "Space"];
const REJECT_CODES = ["Backspace"];

/**
 * @param screen Changes whenever a different screen is on show. Arriving at one
 *   starts a short spell in which these keys do nothing, so a double press — or
 *   a held key — cannot carry the game through two screens at once.
 */
export function useActionKeys(
  actions: ActionKeys,
  active: boolean,
  screen: string,
): { tooSoon: boolean } {
  const actionsRef = useRef(actions);
  /** When the keys start answering again. */
  const readyAtRef = useRef(0);
  /** True just after a press that was ignored, so the screen can say why. */
  const [tooSoon, setTooSoon] = useState(false);
  const flashTimerRef = useRef<number | null>(null);

  const flashTooSoon = useCallback(() => {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }

    setTooSoon(true);
    flashTimerRef.current = window.setTimeout(() => {
      setTooSoon(false);
      flashTimerRef.current = null;
    }, TOO_SOON_FLASH_MS);
  }, []);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    // Re-armed by a new screen, and by the shortcuts being handed back after a
    // dialog closes — the press that closed it must not also act on the game.
    readyAtRef.current = performance.now() + ACTION_KEY_COOLDOWN_MS;
  }, [active, screen]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      // Never hijack a key while somebody is typing into a field. A slider or a
      // checkbox is not typing, so those must not silence the game.
      if (isTextEntryTarget(event.target)) {
        return;
      }

      // Swallowed rather than let through: a button that happens to have focus
      // would otherwise be activated by the browser itself, which would walk
      // straight past this.
      if (performance.now() < readyAtRef.current) {
        if (CONFIRM_CODES.includes(event.code) || REJECT_CODES.includes(event.code)) {
          event.preventDefault();
          // Silence alone reads as a broken key; saying so turns it into an
          // answer.
          flashTooSoon();
        }

        return;
      }

      const handler = CONFIRM_CODES.includes(event.code)
        ? actionsRef.current.onConfirm
        : REJECT_CODES.includes(event.code)
          ? actionsRef.current.onReject
          : undefined;

      if (!handler) {
        return;
      }

      // Stops the browser from doing its own thing — Space scrolls, Backspace
      // can navigate back — and from firing the focused button a second time.
      event.preventDefault();
      // Most actions move to another screen, which re-arms this anyway; the few
      // that do not must still not fire twice over.
      readyAtRef.current = performance.now() + ACTION_KEY_COOLDOWN_MS;
      handler();
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [active, flashTooSoon]);

  return { tooSoon };
}
