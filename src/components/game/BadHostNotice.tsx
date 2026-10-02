import { useLanguage } from '@/i18n/useLanguage'
import { isRedirectHostAcceptable, loopbackAddress } from '@/spotify/config'

import styles from './BadHostNotice.module.scss'

/**
 * Shown when the page is served from an address Spotify refuses as a redirect
 * target — in practice `http://localhost:5173`, which loads the app perfectly
 * and then fails only at login, where the message comes from Spotify and says
 * nothing useful.
 */
export function BadHostNotice() {
  const { t } = useLanguage()

  if (isRedirectHostAcceptable()) {
    return null
  }

  const fixed = loopbackAddress()

  return (
    <div className={styles.notice} role="alert">
      <p>{t('spotify.badHost', { host: window.location.host })}</p>
      <p className={styles.fix}>
        {t('spotify.badHostFix')}{' '}
        <a className={styles.link} href={fixed}>
          {fixed}
        </a>
      </p>
    </div>
  )
}
