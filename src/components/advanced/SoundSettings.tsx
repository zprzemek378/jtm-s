import { useState } from 'react'

import { playSound } from '@/audio/player'
import { SoundEvent } from '@/constants/soundChoices'
import { useLanguage } from '@/i18n/useLanguage'
import { isSoundEnabled, setSoundEnabled } from '@/settings/sound'

import { Checkbox } from '../ui/Checkbox'
import styles from './SoundSettings.module.scss'

/** The one thing a player needs to decide about the game's own cues. */
export function SoundSettings() {
  const { t } = useLanguage()
  const [enabled, setEnabled] = useState(isSoundEnabled)

  return (
    <div className={styles.panel}>
      <Checkbox
        checked={enabled}
        label={t('settings.soundEnabled')}
        onChange={(checked) => {
          setEnabled(checked)
          setSoundEnabled(checked)

          // Hearing one confirms the switch did something.
          if (checked) {
            playSound(SoundEvent.Buzz)
          }
        }}
      />
      <p className={styles.hint}>{t('settings.soundHint')}</p>
    </div>
  )
}
