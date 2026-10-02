import { createContext } from "react";

import type { Language, LocalizedText } from "./language";
import type { TranslationKey } from "./translations";

export type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Translates an interface string; `params` fills in `{name}` placeholders. */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Picks the current language variant from data. */
  localize: (text: LocalizedText) => string;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);
