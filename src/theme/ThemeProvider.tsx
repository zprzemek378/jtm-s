import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { STORAGE_KEYS, readStoredString, writeStoredString } from '@/storage/localStorage'

import { ThemeContext, type ThemeContextValue } from './ThemeContext'
import { Theme, isTheme } from './theme'

/**
 * A stored choice wins; otherwise the system's own preference decides.
 *
 * The inline script in index.html applies the same rule before the first paint
 * — keep the two in step.
 */
function readInitialTheme(): Theme {
  const stored = readStoredString(STORAGE_KEYS.theme)

  if (isTheme(stored)) {
    return stored
  }

  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

  return prefersDark ? Theme.Dark : Theme.Light
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    writeStoredString(STORAGE_KEYS.theme, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === Theme.Dark ? Theme.Light : Theme.Dark))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
