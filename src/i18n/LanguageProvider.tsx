import { useEffect, useMemo, useState, type ReactNode } from "react";

import { STORAGE_KEYS, readStoredString, writeStoredString } from "@/storage/localStorage";

import { LanguageContext, type LanguageContextValue } from "./LanguageContext";
import { DEFAULT_LANGUAGE, isLanguage, type Language, type LocalizedText } from "./language";
import { TRANSLATIONS, type TranslationKey } from "./translations";

function readStoredLanguage(): Language {
  const stored = readStoredString(STORAGE_KEYS.language);

  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    writeStoredString(STORAGE_KEYS.language, language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = TRANSLATIONS[language];

    const t = (key: TranslationKey, params?: Record<string, string | number>) => {
      const template = dictionary[key];

      if (!params) {
        return template;
      }

      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      );
    };

    const localize = (text: LocalizedText) => text[language];

    return { language, setLanguage, t, localize };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
