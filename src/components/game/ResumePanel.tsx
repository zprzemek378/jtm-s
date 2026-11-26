// Games that were never finished, offered back.
//
// Two sources, which the host should not have to think about: what this
// machine was playing when the tab was closed, and what the universe knows is
// still unfinished — the same evening left on somebody else's computer. The
// local one needs nothing to carry on; a game from the universe is pulled down
// first, keeping its id, so it goes on numbering the same log.

import { useCallback, useEffect, useState } from "react";

import { API, type GameDetail, type GameRecord } from "@jtm-s/shared";

import { BackendStatus } from "@/backend/BackendContext";
import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Panel } from "@/components/ui/Panel";
import { readCatalogue, readEvents, readOrigin } from "@/game/gameRecord";
import { adoptGame, readGameLog, writeGameLog, type StoredGame } from "@/game/gameStore";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./ResumePanel.module.scss";

type ResumePanelProps = {
  /** The game this machine was playing, if there is one. */
  local: StoredGame | null;
  /** The universe whose unfinished games are worth offering, or null. */
  universeId: string | null;
  busy: boolean;
  onResume: (game: StoredGame) => void;
  onDiscard: (game: StoredGame) => void;
};

/** How far a stored game got, counting the rounds that were started. */
const roundsOf = (game: StoredGame) =>
  game.events.filter((event) => event.action.type === "start-round").length;

/**
 * A game from the backend as this machine's store holds them, or null when it
 * cannot be carried on: without a track list there is nothing to draw from.
 */
function toStoredGame(detail: GameDetail): StoredGame | null {
  const origin = readOrigin(detail.game.origin);
  const catalogue = readCatalogue(detail.catalogue);

  if (!origin || catalogue.length === 0) {
    return null;
  }

  return {
    id: detail.game.id,
    startedAt: detail.game.startedAt,
    updatedAt: Date.now(),
    historyKey: detail.game.historyKey,
    universeId: detail.game.universeId,
    origin,
    catalogue,
    tracks: [],
    events: readEvents(detail.events),
    // Everything the backend handed over is, by definition, stored there.
    confirmedUpTo: detail.game.upTo,
    closedAt: null,
  };
}

export function ResumePanel({ local, universeId, busy, onResume, onDiscard }: ResumePanelProps) {
  const { t, language } = useLanguage();
  const { status, request } = useBackend();
  const [elsewhere, setElsewhere] = useState<readonly GameRecord[]>([]);
  const [pulling, setPulling] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const look = useCallback(async () => {
    if (status !== BackendStatus.Ready) {
      setElsewhere([]);

      return;
    }

    try {
      const answer = await request<{ games: readonly GameRecord[] }>(
        universeId === null ? API.games : `${API.games}?universeId=${universeId}`,
      );

      setElsewhere(
        answer.games.filter(
          (game) => game.closedAt === null && game.upTo > 0 && game.id !== local?.id,
        ),
      );
    } catch {
      // Nothing to show is the right answer here: these are an extra, and the
      // game this machine holds is offered whatever the backend says.
      setElsewhere([]);
    }
  }, [local?.id, request, status, universeId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void look();
  }, [look]);

  /** Pulls a game down and carries on with it here. */
  const pull = async (record: GameRecord) => {
    setPulling(record.id);
    setFailure(null);

    try {
      const game = toStoredGame(await request<GameDetail>(API.game(record.id)));

      if (!game) {
        // Without the track list there is nothing to draw from: the machine
        // that was playing had a list too large to be worth storing.
        setFailure(t("resume.noCatalogue"));

        return;
      }

      writeGameLog(adoptGame(readGameLog(), game));
      onResume(game);
    } catch (thrown) {
      setFailure(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setPulling(null);
    }
  };

  if (!local && elsewhere.length === 0) {
    return null;
  }

  const when = (at: number) =>
    new Date(at).toLocaleString(language, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Panel title={t("resume.title")}>
      <p className={styles.lead}>{t("resume.lead")}</p>

      {failure ? (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      ) : null}

      <ul className={styles.rows}>
        {local ? (
          <li className={styles.row}>
            <span className={styles.name}>
              {t("resume.detail", {
                round: roundsOf(local),
                names: local.origin.players.map((player) => player.name).join(", "),
              })}
            </span>
            <span className={styles.meta}>{t("resume.here")}</span>

            <div className={styles.actions}>
              <Button
                variant={ButtonVariant.Primary}
                disabled={busy}
                onClick={() => onResume(local)}
              >
                {t("resume.continue")}
              </Button>
              <Button
                variant={ButtonVariant.Ghost}
                disabled={busy}
                onClick={() => onDiscard(local)}
              >
                {t("resume.discard")}
              </Button>
            </div>
          </li>
        ) : null}

        {elsewhere.map((record) => (
          <li key={record.id} className={styles.row}>
            <span className={styles.name}>{when(record.startedAt)}</span>
            <span className={styles.meta}>{t("resume.elsewhere")}</span>

            <div className={styles.actions}>
              <Button
                variant={ButtonVariant.Secondary}
                disabled={busy || pulling !== null}
                onClick={() => void pull(record)}
              >
                {pulling === record.id ? t("resume.pulling") : t("resume.continue")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
