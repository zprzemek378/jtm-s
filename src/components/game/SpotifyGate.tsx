import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useLanguage } from "@/i18n/useLanguage";
import { ROUTES } from "@/routes/paths";
import { SpotifyStatus } from "@/spotify/SpotifyContext";
import { useSpotify } from "@/spotify/useSpotify";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Panel } from "../ui/Panel";
import { BadHostNotice } from "./BadHostNotice";
import { Spinner } from "../ui/Spinner";
import styles from "./SpotifyGate.module.scss";

/**
 * Shows its children only once Spotify can actually play: a Client ID exists,
 * the host is logged in, and the account has Premium. Anything else gets an
 * explanation and the one button that resolves it.
 */
export function SpotifyGate({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { status, needsPremium, login } = useSpotify();
  const location = useLocation();

  if (status === SpotifyStatus.Unconfigured) {
    return (
      <Panel title={t("spotify.title")}>
        <p className={styles.message}>{t("spotify.missingClientId")}</p>
        <p className={styles.hint}>{t("spotify.missingClientIdHint")}</p>
        <div>
          <Link className={styles.link} to={ROUTES.settings}>
            {t("spotify.goToSettings")}
          </Link>
        </div>
      </Panel>
    );
  }

  if (status === SpotifyStatus.Connecting) {
    return (
      <Panel title={t("spotify.title")}>
        <Spinner showLabel label={t("spotify.connecting")} />
      </Panel>
    );
  }

  if (status === SpotifyStatus.LoggedOut) {
    return (
      <Panel title={t("spotify.title")}>
        <BadHostNotice />
        <p className={styles.message}>{t("spotify.notLoggedIn")}</p>
        <p className={styles.hint}>{t("spotify.loginHint")}</p>
        <div>
          <Button variant={ButtonVariant.Primary} onClick={() => login(location.pathname)}>
            {t("spotify.login")}
          </Button>
        </div>
      </Panel>
    );
  }

  if (needsPremium) {
    return (
      <Panel title={t("spotify.title")}>
        <p className={styles.message} role="alert">
          {t("spotify.premiumRequired")}
        </p>
      </Panel>
    );
  }

  return <>{children}</>;
}
