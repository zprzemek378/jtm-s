import { Link } from 'react-router-dom'

import { useLanguage } from '@/i18n/useLanguage'
import { ROUTES } from '@/routes/paths'

import styles from './HomePage.module.scss'

export function HomePage() {
  const { t } = useLanguage()

  const steps = [t('home.step.login'), t('home.step.players'), t('home.step.playlist')]

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.title}>{t('home.title')}</h1>
        <p className={styles.lead}>{t('home.lead')}</p>
        <Link className={styles.cta} to={ROUTES.game}>
          {t('home.start')}
        </Link>
      </header>

      <section className={styles.section} aria-label={t('home.howTo')}>
        <h2 className={styles.sectionTitle}>{t('home.howTo')}</h2>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-label={t('home.requirements')}>
        <h2 className={styles.sectionTitle}>{t('home.requirements')}</h2>
        <ul className={styles.requirements}>
          <li>{t('home.requirement.premium')}</li>
          <li>{t('home.requirement.browser')}</li>
        </ul>
      </section>
    </div>
  )
}
