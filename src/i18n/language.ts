/** Languages supported by the application. */
export const Language = {
  Pl: 'pl',
  En: 'en',
} as const

export type Language = (typeof Language)[keyof typeof Language]

export const LANGUAGES: readonly Language[] = [Language.Pl, Language.En]

export const DEFAULT_LANGUAGE: Language = Language.Pl

/** A piece of text available in every application language. */
export type LocalizedText = Record<Language, string>

/** Language labels — always written in the language itself. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  [Language.Pl]: 'Polski',
  [Language.En]: 'English',
}

export const LANGUAGE_SHORT_LABELS: Record<Language, string> = {
  [Language.Pl]: 'PL',
  [Language.En]: 'EN',
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}
