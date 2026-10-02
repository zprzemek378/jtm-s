import { useEffect, useRef } from "react";

import { advanceCheat } from "@/game/cheatCode";
import { isTextEntryTarget } from "@/helpers/keys";

/**
 * Watches for a typed code and calls back when it completes.
 *
 * Nothing is ever swallowed: no `preventDefault`, no capture phase. A hidden
 * listener that ate keystrokes would be noticeable, which rather defeats it.
 */
export function useCheatCode(active: boolean, onUnlock: () => void): void {
  const onUnlockRef = useRef(onUnlock);

  useEffect(() => {
    onUnlockRef.current = onUnlock;
  }, [onUnlock]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let matched = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (isTextEntryTarget(event.target)) {
        return;
      }

      const progress = advanceCheat(matched, event.key);
      matched = progress.matched;

      if (progress.unlocked) {
        onUnlockRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
}
