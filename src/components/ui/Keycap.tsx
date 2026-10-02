import { keyCodeLabel } from '@/helpers/keys'

import styles from './Keycap.module.scss'

type KeycapProps = {
  /** A `KeyboardEvent.code`, or null when no key is assigned yet. */
  keyCode: string | null
  /** Shown in place of a key when `keyCode` is null. */
  emptyLabel: string
  /** Dims the cap — the player cannot buzz right now. */
  muted?: boolean
}

/** A physical key drawn as a keycap, so a player can find theirs at a glance. */
export function Keycap({ keyCode, emptyLabel, muted = false }: KeycapProps) {
  const classNames = [styles.keycap, keyCode === null ? styles.empty : null, muted ? styles.muted : null]
    .filter(Boolean)
    .join(' ')

  return <span className={classNames}>{keyCode === null ? emptyLabel : keyCodeLabel(keyCode)}</span>
}
