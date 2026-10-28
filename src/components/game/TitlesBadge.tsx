import { TITLE_OPTIONS } from "@/constants/gameRules";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./TitlesBadge.module.scss";

type TitlesBadgeProps = {
  /** Whose lifeline it is, for the label a screen reader reads. */
  name: string;
  /** Spends it. Absent while it is only being shown. */
  onUse?: () => void;
};

/** Where each of the six sits in the mark, as a pair of grid steps. */
const CELLS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [0, 2],
  [1, 2],
];

/**
 * The six-titles lifeline, drawn as the choice it offers.
 *
 * Six cards in a grid with one of them picked out: the shape says "one of
 * these", which is the whole idea, and it is told apart from the stopwatch at
 * a glance by its outline and its own violet.
 */
export function TitlesBadge({ name, onUse }: TitlesBadgeProps) {
  const { t } = useLanguage();
  const label = t(onUse ? "game.titlesUse" : "game.titlesHas", { name, count: TITLE_OPTIONS });

  const mark = (
    <svg
      className={styles.mark}
      viewBox="0 0 44 44"
      role="img"
      aria-label={label}
      focusable="false"
    >
      {CELLS.map(([column, row], index) => (
        <rect
          key={`${column}-${row}`}
          className={index === 3 ? `${styles.cell} ${styles.chosen}` : styles.cell}
          x={5 + column * 18}
          y={5 + row * 12}
          width="16"
          height="10"
          rx="3"
        />
      ))}
    </svg>
  );

  if (!onUse) {
    return <span className={styles.badge}>{mark}</span>;
  }

  return (
    <button
      type="button"
      className={`${styles.badge} ${styles.ready}`}
      title={label}
      onClick={onUse}
    >
      {mark}
    </button>
  );
}
