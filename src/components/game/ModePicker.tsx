import {
  formatMoney,
  MONEY_MAX,
  MONEY_MIN,
  MONEY_STEP,
  REWARD_MODES,
  RewardMode,
} from "@/game/rewards";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./ModePicker.module.scss";

type ModePickerProps = {
  value: RewardMode;
  onChange: (mode: RewardMode) => void;
};

/** How the stake behaves — chosen once, before the game starts. */
export function ModePicker({ value, onChange }: ModePickerProps) {
  const { t } = useLanguage();

  const describe = (mode: RewardMode) =>
    t(`mode.${mode}.description`, {
      amount: formatMoney(MONEY_MIN),
      min: formatMoney(MONEY_MIN),
      max: formatMoney(MONEY_MAX),
      step: formatMoney(MONEY_STEP),
    });

  return (
    <div className={styles.list} role="radiogroup" aria-label={t("setup.mode")}>
      {REWARD_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={mode === value}
          className={mode === value ? `${styles.option} ${styles.optionActive}` : styles.option}
          onClick={() => onChange(mode)}
        >
          <span className={styles.mark} aria-hidden="true">
            {mode === value ? "●" : "○"}
          </span>
          <span className={styles.text}>
            <strong className={styles.name}>{t(`mode.${mode}.name`)}</strong>
            <span className={styles.description}>{describe(mode)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
