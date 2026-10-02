import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { MAX_TIE_THRESHOLD_MS, MIN_TIE_THRESHOLD_MS } from '@/constants/gameRules'
import { KeyboardProbe } from '@/components/advanced/KeyboardProbe'
import { SoundSettings } from '@/components/advanced/SoundSettings'
import { BadHostNotice } from '@/components/game/BadHostNotice'
import { Checkbox } from '@/components/ui/Checkbox'
import { ButtonGroup } from '@/components/ui/ButtonGroup'
import { ButtonVariant } from '@/components/ui/buttonVariant'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { useLanguage } from '@/i18n/useLanguage'
import { isSafeModeEnabled, setSafeModeEnabled } from '@/settings/safeMode'
import {
  areTiesEnabled,
  clampTieThreshold,
  readTieThreshold,
  setTiesEnabled,
  writeTieThreshold,
} from '@/settings/ties'
import {
  BUNDLED_CLIENTS,
  type BundledClient,
  clearClientIdOverride,
  isValidClientId,
  readClientIdOverride,
  redirectUri,
  selectedBundledClient,
  writeClientIdChoice,
  writeClientIdOverride,
} from '@/spotify/config'
import { SpotifyStatus } from '@/spotify/SpotifyContext'
import { useSpotify } from '@/spotify/useSpotify'

import styles from './SettingsPage.module.scss'

export function SettingsPage() {
  const { t } = useLanguage()
  const { status, user, needsPremium, login, logout, refreshClientId } = useSpotify()
  const location = useLocation()

  const [safeMode, setSafeMode] = useState(isSafeModeEnabled)
  const [ties, setTies] = useState(areTiesEnabled)
  const [tieThreshold, setTieThreshold] = useState(() => String(readTieThreshold()))
  const [tieError, setTieError] = useState<string | null>(null)
  const [clientId, setClientId] = useState(() => readClientIdOverride() ?? '')
  const [clientIdError, setClientIdError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [chosenClientId, setChosenClientId] = useState(() => selectedBundledClient()?.id ?? null)

  /** An unnamed application is identified by its slot, the number `.env` uses. */
  const clientLabel = (client: BundledClient) =>
    client.name ?? t('settings.clientIdUnnamed', { slot: String(client.slot) })

  const handleChooseBundled = (client: BundledClient) => {
    if (client.id === chosenClientId) {
      return
    }

    writeClientIdChoice(client.id)
    setChosenClientId(client.id)
    setSaved(false)

    // The stored tokens were issued to the application being left behind, so
    // they are worthless to the new one: carrying the session over would only
    // produce a logged-in screen whose every Spotify call fails.
    if (status === SpotifyStatus.Connecting || status === SpotifyStatus.LoggedIn) {
      logout()
    }

    refreshClientId()
  }

  const handleSaveClientId = () => {
    const value = clientId.trim()

    if (value.length === 0) {
      clearClientIdOverride()
      setClientIdError(null)
      setSaved(true)
      refreshClientId()

      return
    }

    if (!isValidClientId(value)) {
      setClientIdError(t('settings.clientIdInvalid'))
      setSaved(false)

      return
    }

    writeClientIdOverride(value)
    setClientIdError(null)
    setSaved(true)
    // Lifts the "no Client ID" state immediately — no reload needed.
    refreshClientId()
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <Panel title={t('settings.appearance')}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('settings.language')}</span>
          <LanguageSwitcher />
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('settings.theme')}</span>
          <ThemeToggle />
        </div>
      </Panel>

      <Panel title={t('settings.sound')}>
        <SoundSettings />
      </Panel>

      <Panel title={t('settings.keyboard')}>
        <KeyboardProbe />
      </Panel>

      <Panel title={t('settings.ties')}>
        <Checkbox
          checked={ties}
          label={t('settings.tiesEnabled')}
          onChange={(checked) => {
            setTies(checked)
            setTiesEnabled(checked)
          }}
        />
        <p className={styles.hint}>{t('settings.tiesHint')}</p>

        {/* The threshold only means anything when ties are on. */}
        {ties ? (
          <Input
            label={t('settings.tieThreshold')}
            value={tieThreshold}
            inputMode="decimal"
            placeholder="0.2"
            hint={t('settings.tieThresholdHint')}
            error={tieError ?? undefined}
            onChange={(event) => {
              const text = event.target.value
              setTieThreshold(text)

              const parsed = Number.parseFloat(text)

              if (!Number.isFinite(parsed) || parsed !== clampTieThreshold(parsed)) {
                setTieError(
                  t('settings.tieThresholdInvalid', {
                    min: MIN_TIE_THRESHOLD_MS,
                    max: MAX_TIE_THRESHOLD_MS,
                  }),
                )

                return
              }

              setTieError(null)
              writeTieThreshold(parsed)
            }}
          />
        ) : null}
      </Panel>

      <Panel title={t('settings.safety')}>
        <Checkbox
          checked={safeMode}
          label={t('settings.safeMode')}
          onChange={(checked) => {
            setSafeMode(checked)
            setSafeModeEnabled(checked)
          }}
        />
        <p className={styles.hint}>{t('settings.safeModeHint')}</p>
        {safeMode ? null : (
          <p className={styles.warning} role="alert">
            {t('settings.safeModeWarning')}
          </p>
        )}
      </Panel>

      <Panel title={t('settings.spotify')}>
        <BadHostNotice />
        {status === SpotifyStatus.LoggedIn && user ? (
          <>
            <p className={styles.text}>{t('spotify.loggedInAs', { name: user.displayName })}</p>
            {needsPremium ? (
              <p className={styles.error} role="alert">
                {t('spotify.premiumRequired')}
              </p>
            ) : null}
            <div>
              <Button variant={ButtonVariant.Secondary} onClick={logout}>
                {t('spotify.logout')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.text}>
              {status === SpotifyStatus.Unconfigured
                ? t('spotify.missingClientId')
                : t('spotify.notLoggedIn')}
            </p>
            <div>
              <Button
                variant={ButtonVariant.Primary}
                disabled={status === SpotifyStatus.Unconfigured}
                onClick={() => login(location.pathname)}
              >
                {t('spotify.login')}
              </Button>
            </div>
          </>
        )}
      </Panel>

      <Panel title={t('settings.clientId')}>
        {BUNDLED_CLIENTS.length > 1 ? (
          <>
            <p className={styles.hint}>{t('settings.clientIdBuiltIn')}</p>
            <ButtonGroup ariaLabel={t('settings.clientIdBuiltIn')}>
              {BUNDLED_CLIENTS.map((client) => {
                const active = client.id === chosenClientId

                return (
                  <Button
                    key={client.id}
                    variant={active ? ButtonVariant.Primary : ButtonVariant.Secondary}
                    aria-pressed={active}
                    onClick={() => handleChooseBundled(client)}
                  >
                    {clientLabel(client)}
                  </Button>
                )
              })}
            </ButtonGroup>
            <p className={styles.hint}>{t('settings.clientIdBuiltInHint')}</p>
          </>
        ) : null}

        <p className={styles.hint}>
          {chosenClientId
            ? t('settings.clientIdBundled', { id: chosenClientId })
            : t('settings.clientIdBundledNone')}
        </p>

        <Input
          label={t('settings.clientIdOverride')}
          value={clientId}
          placeholder={t('settings.clientIdPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          hint={t('settings.clientIdHint')}
          error={clientIdError ?? undefined}
          onChange={(event) => {
            setClientId(event.target.value)
            setClientIdError(null)
            setSaved(false)
          }}
        />

        <p className={styles.hint}>{t('settings.clientIdRedirectHint', { uri: redirectUri() })}</p>

        <div className={styles.actions}>
          <Button variant={ButtonVariant.Primary} onClick={handleSaveClientId}>
            {t('settings.clientIdSave')}
          </Button>
          <Button
            variant={ButtonVariant.Secondary}
            onClick={() => {
              clearClientIdOverride()
              setClientId('')
              setClientIdError(null)
              setSaved(true)
              refreshClientId()
            }}
          >
            {t('settings.clientIdClear')}
          </Button>
        </div>

        {saved ? <p className={styles.saved}>{t('settings.clientIdSaved')}</p> : null}
      </Panel>
    </div>
  )
}
