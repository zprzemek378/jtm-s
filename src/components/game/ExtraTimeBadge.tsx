import { EXTRA_TIME_MS } from "@/constants/gameRules";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./ExtraTimeBadge.module.scss";

type ExtraTimeBadgeProps = {
  /** Whose lifeline it is, for the label a screen reader reads. */
  name: string;
  /** Spends it. Absent while it is only being shown. */
  onUse?: () => void;
};

/**
 * Extra time, drawn as a stopwatch.
 *
 * Every lifeline gets a mark and a colour of its own, so a glance along the
 * scoreboard says which ones are still in hand. This one is a dial with its
 * crown and a sweep of the seconds it buys, in its own amber; the number lives
 * inside the dial, because a shape alone would not say how many.
 */
export function ExtraTimeBadge({ name, onUse }: ExtraTimeBadgeProps) {
  const { t } = useLanguage();
  const seconds = Math.round(EXTRA_TIME_MS / 1000);
  const label = t(onUse ? "game.extraTimeUse" : "game.extraTimeHas", { name, seconds });

  const stopwatch = (
    <svg
      className={styles.mark}
      viewBox="0 0 44 46"
      role="img"
      aria-label={label}
      focusable="false"
    >
      {/* The crown, and the button either side of it. */}
      <path className={styles.case} d="M17 4h10" />
      <path className={styles.case} d="M22 4v5" />
      <circle className={styles.dial} cx="22" cy="27" r="16" />
      {/* The seconds it adds, swept clockwise from noon. */}
      <path className={styles.sweep} d="M22 11a16 16 0 0 1 13.9 8" />
      <text className={styles.text} x="22" y="28" textAnchor="middle" dominantBaseline="central">
        +{seconds}
      </text>
    </svg>
  );

  if (!onUse) {
    return <span className={styles.badge}>{stopwatch}</span>;
  }

  return (
    <button
      type="button"
      className={`${styles.badge} ${styles.ready}`}
      title={label}
      onClick={onUse}
    >
      {stopwatch}
    </button>
  );
}
