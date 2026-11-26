// One game, step by step.
//
// Read from the backend and replayed here rather than stored as a summary: the
// events are the game, so anything a summary could say is already in them —
// and a view that replays them cannot drift from what the rules actually did.

import { useCallback, useEffect, useMemo, useState } from "react";

import { API, type GameDetail } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import { replaySteps } from "@/game/eventLog";
import { readEvents, readOrigin, readTracks } from "@/game/gameRecord";
import { describeStep } from "@/game/historyLines";
import { formatMoney } from "@/game/rewards";
import { balanceOf } from "@/helpers/money";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./GameHistory.module.scss";

type GameHistoryProps = {
  gameId: string;
  onClose: () => void;
};

export function GameHistory({ gameId, onClose }: GameHistoryProps) {
  const { t } = useLanguage();
  const { request } = useBackend();
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const load = useCallback(async () => {
    try {
      setDetail(await request<GameDetail>(API.game(gameId)));
      setFailure(null);
    } catch (thrown) {
      setFailure(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }, [gameId, request]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  /** The whole game, as the state before each step and after it. */
  const replay = useMemo(() => {
    if (!detail) {
      return null;
    }

    const origin = readOrigin(detail.game.origin);

    if (!origin) {
      return null;
    }

    const events = readEvents(detail.events);
    const steps = replaySteps(origin, readTracks(detail.tracks, detail.catalogue), events);

    return steps ? { events, steps } : null;
  }, [detail]);

  if (!detail && failure === null) {
    return <Spinner showLabel label={t("common.loading")} />;
  }

  if (!replay) {
    return (
      <Panel
        title={t("history.title")}
        actions={
          <Button small variant={ButtonVariant.Ghost} onClick={onClose}>
            {t("common.close")}
          </Button>
        }
      >
        <p className={styles.failure} role="alert">
          {failure ?? t("history.unreadable")}
        </p>
      </Panel>
    );
  }

  // One more state than there are events: the game before anything happened.
  const shown = Math.min(step, replay.steps.length - 1);
  const state = replay.steps[shown];
  const winner = state?.winnerId
    ? state.players.find((player) => player.id === state.winnerId)
    : null;

  return (
    <Panel
      title={t("history.title")}
      meta={`${shown} / ${replay.events.length}`}
      actions={
        <Button small variant={ButtonVariant.Ghost} onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className={styles.layout}>
        <ol className={styles.steps}>
          <li>
            <button
              type="button"
              className={shown === 0 ? styles.stepCurrent : styles.step}
              onClick={() => setStep(0)}
            >
              {t("history.start")}
            </button>
          </li>

          {replay.events.map((event, index) => {
            const before = replay.steps[index];
            const after = replay.steps[index + 1];

            if (!before || !after) {
              return null;
            }

            const line = describeStep(event.action, before, after);

            return (
              <li key={event.seq}>
                <button
                  type="button"
                  className={shown === index + 1 ? styles.stepCurrent : styles.step}
                  onClick={() => setStep(index + 1)}
                >
                  {t(line.key, line.params)}
                </button>
              </li>
            );
          })}
        </ol>

        <div className={styles.standings}>
          <h3 className={styles.standingsTitle}>{t("history.standings")}</h3>

          <ul className={styles.scores}>
            {state?.players.map((player) => (
              <li key={player.id} className={styles.score}>
                <span className={styles.dot} style={{ backgroundColor: player.colour }} />
                <span className={styles.scoreName}>{player.name}</span>
                <span className={styles.scoreMoney}>
                  {formatMoney(balanceOf(state.accounts, player.id))}
                </span>
              </li>
            ))}
          </ul>

          {winner ? (
            <p className={styles.winner}>{t("history.winner", { name: winner.name })}</p>
          ) : null}

          <div className={styles.stepButtons}>
            <Button
              small
              variant={ButtonVariant.Secondary}
              disabled={shown === 0}
              onClick={() => setStep(shown - 1)}
            >
              ←
            </Button>
            <Button
              small
              variant={ButtonVariant.Secondary}
              disabled={shown >= replay.steps.length - 1}
              onClick={() => setStep(shown + 1)}
            >
              →
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
