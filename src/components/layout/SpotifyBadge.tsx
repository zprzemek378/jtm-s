import { useLanguage } from "@/i18n/useLanguage";
import { SpotifyStatus } from "@/spotify/SpotifyContext";
import { useSpotify } from "@/spotify/useSpotify";

import styles from "./SpotifyBadge.module.scss";

type SpotifyBadgeProps = {
  /** Shows only the status dot, for the collapsed sidebar. */
  compact?: boolean;
};

/** Whether the app is connected to Spotify, always visible in the sidebar. */
export function SpotifyBadge({ compact = false }: SpotifyBadgeProps) {
  const { t } = useLanguage();
  const { status, user, needsPremium } = useSpotify();

  const label =
    status === SpotifyStatus.LoggedIn && user
      ? user.displayName
      : status === SpotifyStatus.Connecting
        ? t("spotify.connecting")
        : status === SpotifyStatus.Unconfigured
          ? t("spotify.missingClientId")
          : t("spotify.notLoggedIn");

  const state =
    status === SpotifyStatus.LoggedIn && !needsPremium
      ? styles.online
      : status === SpotifyStatus.Connecting
        ? styles.pending
        : styles.offline;

  return (
    <div className={compact ? `${styles.badge} ${styles.compact}` : styles.badge} title={label}>
      <span className={`${styles.dot} ${state}`} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <span className={styles.srOnly}>{t("spotify.title")}</span>
    </div>
  );
}
