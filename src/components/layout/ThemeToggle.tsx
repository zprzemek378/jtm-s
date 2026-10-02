import { useLanguage } from '@/i18n/useLanguage'
import { Theme } from '@/theme/theme'
import { useTheme } from '@/theme/useTheme'

import { Button } from '../ui/Button'
import { ButtonVariant } from '../ui/buttonVariant'

type ThemeToggleProps = {
  /** Shows only the icon, for the collapsed sidebar. */
  compact?: boolean
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()

  const isDark = theme === Theme.Dark
  const label = isDark ? t('theme.toggleToLight') : t('theme.toggleToDark')

  return (
    <Button
      small
      iconOnly={compact}
      variant={ButtonVariant.Secondary}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      {compact ? null : <span>{isDark ? t('theme.light') : t('theme.dark')}</span>}
    </Button>
  )
}
