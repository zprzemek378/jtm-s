import type { CSSProperties } from 'react'

import { playerHue } from '@/constants/players'
import { formatMoney } from '@/game/rewards'
import type { GamePlayer, PlayerId } from '@/game/types'
import { balanceOf, type Accounts } from '@/helpers/money'
import { useLanguage } from '@/i18n/useLanguage'

import { Keycap } from '../ui/Keycap'
import styles from './Scoreboard.module.scss'

type ScoreboardProps = {
  players: readonly GamePlayer[]
  accounts: Accounts
  targetMoney: number
  /** Players sitting out this round; their key does nothing and they are dimmed. */
  suspended: readonly PlayerId[]
  /** Players who will sit out the next round. */
  pendingSuspended: readonly PlayerId[]
  /** The player who buzzed in, highlighted while they answer. */
  buzzedPlayerId: PlayerId | null
  /** Marks the winner once the game is over. */
  winnerId?: PlayerId | null
}

/** Who is playing, what they have scored, and whose key is live right now. */
export function Scoreboard({
  players,
  accounts,
  targetMoney,
  suspended,
  pendingSuspended,
  buzzedPlayerId,
  winnerId = null,
}: ScoreboardProps) {
  const { t } = useLanguage()

  return (
    <ul className={styles.board}>
      {players.map((player) => {
        const isSuspended = suspended.includes(player.id)
        const isPending = pendingSuspended.includes(player.id)
        const classNames = [
          styles.card,
          isSuspended ? styles.suspended : null,
          player.id === buzzedPlayerId ? styles.buzzed : null,
          player.id === winnerId ? styles.winner : null,
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <li
            key={player.id}
            className={classNames}
            style={{ '--player-hue': playerHue(player.hueIndex) } as CSSProperties}
          >
            <div className={styles.head}>
              <span className={styles.name}>{player.name}</span>
              <Keycap keyCode={player.keyCode} emptyLabel="—" muted={isSuspended} />
            </div>

            <div className={styles.score}>
              <strong className={styles.scoreValue}>
                {formatMoney(balanceOf(accounts, player.id))}
              </strong>
              <span className={styles.scoreTotal}>
                {t('common.of')} {formatMoney(targetMoney)}
              </span>
            </div>

            {isSuspended ? (
              <span className={styles.badge}>{t('game.suspendedNow')}</span>
            ) : isPending ? (
              <span className={styles.badge}>{t('game.suspendedNext')}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
