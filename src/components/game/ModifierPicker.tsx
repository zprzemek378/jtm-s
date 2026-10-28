import { Checkbox } from "@/components/ui/Checkbox";
import { EXTRA_TIME_MS } from "@/constants/gameRules";
import { MODIFIER_FREQUENCIES, ModifierFrequency, type GameModifiers } from "@/game/modifiers";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import styles from "./ModifierPicker.module.scss";

const EXTRA_TIME_SECONDS = Math.round(EXTRA_TIME_MS / 1000);

type ModifierPickerProps = {
  value: GameModifiers;
  onChange: (modifiers: GameModifiers) => void;
};

/**
 * The extras a table can switch on before a game.
 *
 * All off to begin with: a modifier changes what a round is, and that is for
 * the room to agree on rather than to discover mid-song.
 */
export function ModifierPicker({ value, onChange }: ModifierPickerProps) {
  const { t } = useLanguage();
  const on = value.lyricsOnly !== null;

  return (
    <div className={styles.list}>
      <Checkbox
        checked={on}
        label={t("game.lyricsOnly")}
        onChange={(checked) =>
          onChange({ ...value, lyricsOnly: checked ? ModifierFrequency.Medium : null })
        }
      />
      <p className={styles.hint}>{t("setup.lyricsOnlyHint")}</p>

      {on ? (
        <div className={styles.frequency} role="group" aria-label={t("setup.howOften")}>
          <span className={styles.frequencyLabel}>{t("setup.howOften")}</span>
          {MODIFIER_FREQUENCIES.map((frequency) => (
            <Button
              key={frequency}
              small
              variant={ButtonVariant.Secondary}
              active={frequency === value.lyricsOnly}
              aria-pressed={frequency === value.lyricsOnly}
              onClick={() => onChange({ ...value, lyricsOnly: frequency })}
            >
              {t(`setup.frequency.${frequency}`)}
            </Button>
          ))}
        </div>
      ) : null}

      <hr className={styles.rule} />

      <Checkbox
        checked={value.extraTime}
        label={t("game.extraTime", { seconds: EXTRA_TIME_SECONDS })}
        onChange={(checked) => onChange({ ...value, extraTime: checked })}
      />
      <p className={styles.hint}>{t("setup.extraTimeHint", { seconds: EXTRA_TIME_SECONDS })}</p>
    </div>
  );
}
