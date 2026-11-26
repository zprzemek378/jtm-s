// The shared side of the game: the universes this account belongs to.
//
// Everything here is optional. With no backend configured, or nobody signed in
// to it, the game is exactly what it was — one computer, one evening — and this
// page says so rather than pretending something is broken.

import { useState } from "react";

import { API, type Universe } from "@jtm-s/shared";

import { BackendStatus } from "@/backend/BackendContext";
import { useBackend } from "@/backend/useBackend";
import { useSpotify } from "@/spotify/useSpotify";
import { SpotifyStatus } from "@/spotify/SpotifyContext";
import { FreePlayHistory } from "@/components/universe/FreePlayHistory";
import { UniverseDetail } from "@/components/universe/UniverseDetail";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniversePage.module.scss";

export function UniversePage() {
  const { t } = useLanguage();
  const { status: spotifyStatus } = useSpotify();
  const {
    status,
    account,
    mayCreateUniverse,
    universes,
    error,
    signIn,
    signOut,
    refresh,
    request,
    pending,
    syncing,
    syncNow,
  } = useBackend();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);

    try {
      const { universe } = await request<{ universe: Universe }>(API.universes, {
        method: "POST",
        body: { name: newName.trim() },
      });

      setNewName("");
      await refresh();
      setSelected(universe.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("universe.title")}</h1>

      {status === BackendStatus.Absent ? (
        <Panel title={t("universe.offTitle")}>
          <p className={styles.lead}>{t("universe.offLead")}</p>
        </Panel>
      ) : null}

      {status === BackendStatus.SigningIn ? (
        <Spinner showLabel label={t("universe.signingIn")} />
      ) : null}

      {status === BackendStatus.SignedOut ? (
        <Panel title={t("universe.signedOutTitle")}>
          <p className={styles.lead}>{t("universe.signedOutLead")}</p>
          {error ? (
            <p className={styles.failure} role="alert">
              {error}
            </p>
          ) : null}
          <Button
            variant={ButtonVariant.Primary}
            disabled={spotifyStatus !== SpotifyStatus.LoggedIn}
            onClick={() => void signIn()}
          >
            {t("universe.signIn")}
          </Button>
          {spotifyStatus !== SpotifyStatus.LoggedIn ? (
            <p className={styles.hint}>{t("universe.needsSpotify")}</p>
          ) : null}
        </Panel>
      ) : null}

      {status === BackendStatus.Ready ? (
        <>
          <Panel
            title={t("universe.account")}
            meta={account?.displayName}
            actions={
              <Button small variant={ButtonVariant.Ghost} onClick={signOut}>
                {t("universe.signOut")}
              </Button>
            }
          >
            <p className={styles.lead}>
              {pending > 0 ? t("universe.pending", { count: pending }) : t("universe.allSent")}
            </p>
            {error ? (
              <p className={styles.failure} role="alert">
                {error}
              </p>
            ) : null}
            <Button
              small
              variant={ButtonVariant.Secondary}
              disabled={syncing || pending === 0}
              onClick={() => void syncNow()}
            >
              {syncing ? t("universe.syncing") : t("universe.syncNow")}
            </Button>
          </Panel>

          <Panel title={t("universe.yours")} meta={universes.length}>
            {universes.length === 0 ? (
              <p className={styles.lead}>{t("universe.noneYet")}</p>
            ) : (
              <ul className={styles.list}>
                {universes.map((universe) => (
                  <li key={universe.id}>
                    <Button
                      variant={
                        selected === universe.id ? ButtonVariant.Primary : ButtonVariant.Secondary
                      }
                      onClick={() => setSelected(selected === universe.id ? null : universe.id)}
                    >
                      {universe.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {mayCreateUniverse ? (
              <div className={styles.createRow}>
                <Input
                  label={t("universe.newName")}
                  hideLabel
                  placeholder={t("universe.newName")}
                  value={newName}
                  maxLength={80}
                  disabled={creating}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <Button
                  variant={ButtonVariant.Secondary}
                  disabled={creating || newName.trim().length === 0}
                  onClick={() => void create()}
                >
                  {t("universe.create")}
                </Button>
              </div>
            ) : (
              <p className={styles.hint}>{t("universe.cannotCreate")}</p>
            )}
          </Panel>

          {selected ? (
            <UniverseDetail
              universeId={selected}
              onDeleted={() => {
                setSelected(null);
                void refresh();
              }}
            />
          ) : null}

          {/* Free play keeps a history too, and it is the mode the app starts
              in — so the games played outside any universe are read here, from
              the same list and the same step-by-step view. */}
          <FreePlayHistory />
        </>
      ) : null}
    </div>
  );
}
