import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useLanguage } from '@/i18n/useLanguage'
import { ROUTES } from '@/routes/paths'
import { STORAGE_KEYS, readStoredString, writeStoredString } from '@/storage/localStorage'

import { LanguageSwitcher } from './LanguageSwitcher'
import { SpotifyBadge } from './SpotifyBadge'
import { ThemeToggle } from './ThemeToggle'
import styles from './AppLayout.module.scss'

function readStoredCollapsed(): boolean {
  return readStoredString(STORAGE_KEYS.sidebarCollapsed) === 'true'
}

export function AppLayout() {
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(readStoredCollapsed)

  useEffect(() => {
    writeStoredString(STORAGE_KEYS.sidebarCollapsed, String(collapsed))
  }, [collapsed])

  const navItems = [
    { to: ROUTES.home, label: t('nav.home'), icon: '⌂' },
    { to: ROUTES.game, label: t('nav.game'), icon: '♪' },
    { to: ROUTES.settings, label: t('nav.settings'), icon: '⚙' },
  ]

  const toggleLabel = collapsed ? t('nav.open') : t('nav.close')

  return (
    <div className={styles.shell}>
      <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
        {/* Handle pinned to the outer edge of the sidebar, outside the scroll area. */}
        <button
          type="button"
          className={styles.collapseHandle}
          onClick={() => setCollapsed((value) => !value)}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
        </button>

        <div className={styles.sidebarInner}>
          <div className={styles.brandRow}>
            <NavLink to={ROUTES.home} className={styles.brand}>
              {collapsed ? 'JTM' : t('app.name')}
            </NavLink>
            <span className={styles.tagline}>{t('app.tagline')}</span>
          </div>

          <nav className={styles.nav} aria-label={t('nav.label')}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === ROUTES.home}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
                }
              >
                <span className={styles.navIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.controls}>
            <SpotifyBadge compact={collapsed} />
            <LanguageSwitcher compact={collapsed} />
            <ThemeToggle compact={collapsed} />
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
