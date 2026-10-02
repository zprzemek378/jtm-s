import { useState } from "react";

import { useGameSounds } from "@/audio/useGameSounds";
import { formatMoney, upcomingDirectionHint } from "@/game/rewards";
import { useCheatCode } from "@/hooks/useCheatCode";
import { GamePhase, SuspensionReason, type GamePlayer, type GameRules } from "@/game/types";
import { useGameSession } from "@/game/useGameSession";
import { useLanguage } from "@/i18n/useLanguage";
import type { PooledTrack } from "@/helpers/trackUnion";

import { ConfirmDialog } from "../advanced/ConfirmDialog";
import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { EditModeDialog } from "./EditModeDialog";
import { GameOverPanel } from "./GameOverPanel";
import { RoundStage } from "./RoundStage";
import { Scoreboard } from "./Scoreboard";
import styles from "./GameBoard.module.scss";

type GameBoardProps = {
  players: readonly GamePlayer[];
  rules: GameRules;
  tracks: readonly PooledTrack[];
  /** Identifies the playlist selection, for the no-repeats history. */
  historyKey: string;
  /** Leaves the game and returns to the setup screen. */
  onChangeSettings: () => void;
};

/** A running game: the round on stage, the scoreboard under it. */
export function GameBoard({
  players,
  rules,
  tracks,
  historyKey,
  onChangeSettings,
}: GameBoardProps) {
  const { t } = useLanguage();
  const session = useGameSession(players, rules, tracks, historyKey);

  useGameSounds(session);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [editing, setEditing] = useState(false);

  const { state } = session;

  // The hidden way in. Listened for only while the game waits on the host, and
  // never while a dialog is already open.
  const betweenRounds =
    state.phase === GamePhase.TimedOut ||
    state.phase === GamePhase.Judged ||
    state.phase === GamePhase.Tied;

  useCheatCode(betweenRounds && !editing && !confirmingAbandon, () => setEditing(true));

  if (state.phase === GamePhase.Finished) {
    return (
      <GameOverPanel
        players={players}
        accounts={state.accounts}
        winnerId={state.winnerId}
        onPlayAgain={session.restart}
        onChangeSettings={onChangeSettings}
      />
    );
  }

  /**
   * Who sits out, and for which round.
   *
   * While a round is being played that is whoever is sitting out of it. Once it
   * is over and the screen is about the next one, it is whoever will sit out of
   * that — the round just finished is done with, and saying who missed it reads
   * as though they were still missing something.
   */
  const roundInPlay =
    state.phase === GamePhase.Listening ||
    state.phase === GamePhase.Buzzed ||
    state.phase === GamePhase.Revealed;
  const suspension = roundInPlay ? state.suspension : state.pendingSuspension;
  const suspendedNames = players
    .filter((player) => suspension?.playerIds.includes(player.id) ?? false)
    .map((player) => player.name);

  return (
    <div className={styles.board}>
      <header className={styles.header}>
        <span className={styles.target}>
          {t("game.target", { target: formatMoney(rules.targetMoney) })}
          {" · "}
          {t(`mode.${rules.mode}.name`)}
        </span>
        <Button small variant={ButtonVariant.Ghost} onClick={() => setConfirmingAbandon(true)}>
          {t("game.abandon")}
        </Button>
      </header>

      <RoundStage
        session={session}
        players={players}
        rules={rules}
        upcomingDirection={upcomingDirectionHint(rules.mode, state.round + 1)}
        shortcutsEnabled={!confirmingAbandon && !editing}
      />

      {suspendedNames.length > 0 ? (
        <p className={styles.suspended}>
          {/* One sentence however many are sitting out — several at once can
              only happen through edit mode, but it reads badly otherwise. */}
          {t(
            `game.suspended.${suspension?.reason ?? SuspensionReason.WrongAnswer}${
              roundInPlay ? "" : "Next"
            }${suspendedNames.length > 1 ? "Many" : ""}`,
            { names: suspendedNames.join(", ") },
          )}
        </p>
      ) : null}

      <section aria-label={t("game.scores")}>
        <h2 className={styles.scoresTitle}>{t("game.scores")}</h2>
        <Scoreboard
          players={players}
          accounts={state.accounts}
          targetMoney={rules.targetMoney}
          // Only while the round is being played. Once it is over, the screen
          // is about getting ready for the next one, and a card still marked
          // for the round just finished reads as though that player were out of
          // the coming one too.
          suspended={roundInPlay ? (state.suspension?.playerIds ?? []) : []}
          pendingSuspended={state.pendingSuspension?.playerIds ?? []}
          buzzedPlayerId={state.buzzedPlayerId}
        />
      </section>

      {editing ? (
        <EditModeDialog
          players={players}
          accounts={state.accounts}
          suspendedNext={state.pendingSuspension?.playerIds ?? []}
          targetMoney={rules.targetMoney}
          onApply={(accounts, suspendedNext) => {
            session.applyEdit(accounts, suspendedNext);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      {confirmingAbandon ? (
        <ConfirmDialog
          destructive
          title={t("game.abandon")}
          message={t("game.abandonConfirm")}
          confirmLabel={t("game.abandonConfirmYes")}
          cancelLabel={t("common.cancel")}
          closeLabel={t("common.close")}
          onConfirm={onChangeSettings}
          onCancel={() => setConfirmingAbandon(false)}
        />
      ) : null}
    </div>
  );
}
