import { useRef, type KeyboardEvent, type ReactNode } from "react";

import styles from "./ButtonGroup.module.scss";

type ButtonGroupProps = {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
};

const NAVIGATION_KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];

/**
 * A row of related buttons the arrow keys move between, so a choice can be made
 * without reaching for Tab. Enter and Space still activate the focused button.
 */
export function ButtonGroup({ children, ariaLabel, className }: ButtonGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAVIGATION_KEYS.includes(event.key)) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (buttons.length < 2 || currentIndex === -1) {
      return;
    }

    // Stop the arrow from also scrolling the page.
    event.preventDefault();

    const lastIndex = buttons.length - 1;
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else {
      nextIndex = lastIndex;
    }

    buttons[nextIndex]?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={className ? `${styles.group} ${className}` : styles.group}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
