import { useState } from 'react'

import { formatMoney } from '@/game/rewards'
import type { GamePlayer, PlayerId } from '@/game/types'
import { balanceOf, type Accounts } from '@/helpers/money'
import { useLanguage } from '@/i18n/useLanguage'

import { Modal } from '../advanced/Modal'
import { Button } from '../ui/Button'
import { ButtonVariant } from '../ui/buttonVariant'
import { Checkbox } from '../ui/Checkbox'
import { Input } from '../ui/Input'
import styles from './EditModeDialog.module.scss'

type EditModeDialogProps = {
  players: readonly GamePlayer[]
  accounts: Accounts
  /** Who is already booked to sit out the next round. */
  suspendedNext: readonly PlayerId[]
  targetMoney: number
  onApply: (accounts: Accounts, suspendedNext: readonly PlayerId[]) => void
  onCancel: () => void
}

/** Whatever was typed, reduced to a sum a game can hold. */
function toBalance(text: string): number {
  const parsed = Number.parseInt(text, 10)

  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/** The hidden edit screen: rewrites balances and next-round bans by hand. */
export function EditModeDialog({
  players,
  accounts,
  suspendedNext,
  targetMoney,
  onApply,
  onCancel,
}: EditModeDialogProps) {
  const { t } = useLanguage()

  // Held as text while it is being typed, so a half-typed number does not get
  // rewritten under the cursor.
  const [drafts, setDrafts] = useState<Record<PlayerId, string>>(() =>
    Object.fromEntries(players.map((player) => [player.id, String(balanceOf(accounts, player.id))])),
  )
  const [banned, setBanned] = useState<readonly PlayerId[]>(suspendedNext)

  const apply = () => {
    onApply(
      Object.fromEntries(players.map((player) => [player.id, toBalance(drafts[player.id] ?? '0')])),
      banned,
    )
  }

  return (
    <Modal
      title={t('edit.title')}
      onClose={onCancel}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant={ButtonVariant.Secondary} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={ButtonVariant.Primary} onClick={apply}>
            {t('edit.apply')}
          </Button>
        </>
      }
    >
      <p className={styles.intro}>{t('edit.intro')}</p>

      <ul className={styles.list}>
        {players.map((player) => {
          const draft = drafts[player.id] ?? '0'
          const endsGame = toBalance(draft) >= targetMoney

          return (
            <li key={player.id} className={styles.row}>
              <Input
                className={styles.money}
                type="number"
                min={0}
                step={10}
                inputMode="numeric"
                label={t('edit.money', { name: player.name })}
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [player.id]: event.target.value }))
                }
                hint={endsGame ? t('edit.willEndGame', { target: formatMoney(targetMoney) }) : undefined}
              />

              <Checkbox
                className={styles.ban}
                checked={banned.includes(player.id)}
                label={t('edit.ban')}
                onChange={(checked) =>
                  setBanned((current) =>
                    checked
                      ? [...current, player.id]
                      : current.filter((id) => id !== player.id),
                  )
                }
              />
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
