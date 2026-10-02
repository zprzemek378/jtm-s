import type { ReactNode } from 'react'

import styles from './Panel.module.scss'

type PanelProps = {
  title: ReactNode
  /** Secondary information shown next to the title, such as a count. */
  meta?: ReactNode
  /** Buttons aligned to the right of the header. */
  actions?: ReactNode
  children: ReactNode
  ariaLabel?: string
  /** Removes the padding from the body, for lists that draw their own rows. */
  flush?: boolean
}

/** Bordered section with a header — the shared shell for a block of settings. */
export function Panel({ title, meta, actions, children, ariaLabel, flush = false }: PanelProps) {
  return (
    <section className={styles.panel} aria-label={ariaLabel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  )
}
