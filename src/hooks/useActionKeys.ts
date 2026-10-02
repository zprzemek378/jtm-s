import { useEffect, useRef } from "react";

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

export function useActionKeys(actions: ActionKeys, active: boolean): void {
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

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
      handler();
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [active]);
}
