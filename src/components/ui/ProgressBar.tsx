import type { ReactNode } from "react";

import { ProgressTone } from "./progressTone";
import styles from "./ProgressBar.module.scss";

type ProgressBarProps = {
  value: number;
  max: number;
  /** Text shown under the bar, typically counters. */
  label?: ReactNode;
  ariaLabel?: string;
  tone?: ProgressTone;
  /** Thicker bar, for the countdown that carries the round. */
  tall?: boolean;
  /**
   * Skips the width transition. A countdown updates ten times a second, and an
   * easing on every step makes it look like it is lagging behind.
   */
  instant?: boolean;
};

export function ProgressBar({
  value,
  max,
  label,
  ariaLabel,
  tone = ProgressTone.Accent,
  tall = false,
  instant = false,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fillClassNames = [styles.fill, styles[tone], instant ? styles.instant : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.wrapper}>
      <div
        className={tall ? `${styles.track} ${styles.trackTall}` : styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
      >
        <div className={fillClassNames} style={{ width: `${percent}%` }} />
      </div>
      {label ? <div className={styles.label}>{label}</div> : null}
    </div>
  );
}
