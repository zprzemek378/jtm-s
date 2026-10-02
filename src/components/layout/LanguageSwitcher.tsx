import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_SHORT_LABELS } from "@/i18n/language";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import styles from "./LanguageSwitcher.module.scss";

type LanguageSwitcherProps = {
  /** Stacks the options vertically, for the collapsed sidebar. */
  compact?: boolean;
};

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className={compact ? `${styles.group} ${styles.compact}` : styles.group}
      role="group"
      aria-label={t("settings.language")}
    >
      {LANGUAGES.map((item) => (
        <Button
          key={item}
          small
          variant={ButtonVariant.Ghost}
          active={item === language}
          aria-pressed={item === language}
          title={LANGUAGE_LABELS[item]}
          onClick={() => setLanguage(item)}
        >
          {LANGUAGE_SHORT_LABELS[item]}
        </Button>
      ))}
    </div>
  );
}
