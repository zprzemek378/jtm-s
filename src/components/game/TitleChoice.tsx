import type { TitleOption } from "@/game/titleChoice";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./TitleChoice.module.scss";

type TitleChoiceProps = {
  options: readonly TitleOption[];
  onPick: (trackId: string) => void;
};

/**
 * Six titles, one of them right.
 *
 * Titles and nothing else: an artist, a cover or the playlist it came from
 * would each give the answer away. Picking one is the answer — the round is
 * marked on the click, with nobody to say it out loud to.
 */
export function TitleChoice({ options, onPick }: TitleChoiceProps) {
  const { t } = useLanguage();

  return (
    <div className={styles.choice}>
      <p className={styles.label}>{t("game.titlesPick")}</p>

      <div className={styles.grid}>
        {options.map((option) => (
          <button
            key={option.trackId}
            type="button"
            className={styles.option}
            onClick={() => onPick(option.trackId)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
