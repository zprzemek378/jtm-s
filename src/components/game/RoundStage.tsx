import { formatMoney, RewardDirection } from "@/game/rewards";
import type { GameSession } from "@/game/useGameSession";
import { GamePhase, Verdict, type GamePlayer, type GameRules } from "@/game/types";
import { msToWholeSeconds } from "@/helpers/format";
import { useActionKeys } from "@/hooks/useActionKeys";
import { useCountdown } from "@/hooks/useCountdown";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonGroup } from "../ui/ButtonGroup";
import { ButtonVariant } from "../ui/buttonVariant";
import { Keycap } from "../ui/Keycap";
import { ProgressBar } from "../ui/ProgressBar";
import { ProgressTone } from "../ui/progressTone";
import { Spinner } from "../ui/Spinner";
import { TrackCard } from "./TrackCard";
import { TrackScrubber } from "./TrackScrubber";
import styles from "./RoundStage.module.scss";

type RoundStageProps = {
  session: GameSession;
  players: readonly GamePlayer[];
  rules: GameRules;
  /** The direction of the round to come, when the mode announces it. */
  upcomingDirection: RewardDirection | null;
  /** False while a dialog is open, so a shortcut cannot fire behind it. */
  shortcutsEnabled?: boolean;
};

/** The part of the game screen that changes with the phase of the round. */
export function RoundStage({
  session,
  players,
  rules,
  upcomingDirection,
  shortcutsEnabled = true,
}: RoundStageProps) {
  const { t } = useLanguage();
  const {
    state,
    guessRemainingMs,
    loadingTrack,
    startFailed,
    preRollActive,
    preRollRemainingMs,
    currentMoney,
  } = session;

  /** The line that tells the table what kind of round is coming. */
  const upcomingLine =
    upcomingDirection === null
      ? null
      : t("game.nextRoundDirection", {
          direction: t(`game.direction.${upcomingDirection}`),
        });
  const { phase, track, buzzedPlayerId, startPositionMs, round, lastVerdict } = state;

  // Purely informational: the table agrees on how long an answer may take, and
  // nothing happens when it runs out.
  const answerRemainingMs = useCountdown({
    durationMs: rules.answerDurationMs,
    active: phase === GamePhase.Buzzed,
    runKey: `${round}-answer`,
  });

  const buzzedPlayer = players.find((player) => player.id === buzzedPlayerId) ?? null;

  // Bound before the phase branches below, because hooks cannot live behind a
  // return. Each phase offers whichever of the two actions it actually has.
  const { tooSoon } = useActionKeys(
    preRollActive
      ? {}
      : startFailed
        ? { onConfirm: session.nextRound }
        : phase === GamePhase.Buzzed
          ? { onConfirm: session.reveal }
          : phase === GamePhase.Revealed
            ? {
                onConfirm: () => session.judge(Verdict.Correct),
                onReject: () => session.judge(Verdict.Incorrect),
              }
            : phase === GamePhase.TimedOut || phase === GamePhase.Judged || phase === GamePhase.Tied
              ? { onConfirm: session.nextRound }
              : {},
    shortcutsEnabled,
    // Names the screen on show. The round number is part of it so that two
    // rounds reaching the same phase are still two separate arrivals.
    preRollActive
      ? `pre-roll-${round}`
      : startFailed
        ? `start-failed-${round}`
        : `${phase}-${round}`,
  );

  /**
   * The line under the buttons: which keys do what, or a word about a press
   * that was ignored. The same line either way, so nothing shifts on screen.
   */
  const shortcutHint = (key: "game.shortcutConfirm" | "game.shortcutJudge") => (
    <p className={tooSoon ? `${styles.shortcut} ${styles.tooSoon}` : styles.shortcut}>
      {tooSoon ? t("game.tooSoon") : t(key)}
    </p>
  );

  // Comes before every phase branch: the count-in runs while the round is still
  // formally over, and it owns the screen until the music is playing.
  if (preRollActive) {
    const secondsToGo = msToWholeSeconds(preRollRemainingMs);

    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>{t("game.getReady")}</p>
        {upcomingLine ? <p className={styles.hint}>{upcomingLine}</p> : null}
        {secondsToGo > 0 ? (
          <div className={styles.countdown}>{secondsToGo}</div>
        ) : (
          // The count reached zero and the track is being started; keeping the
          // same screen avoids a flicker between two layouts.
          <Spinner showLabel label={t("game.loadingTrack")} />
        )}
      </div>
    );
  }

  if (startFailed) {
    return (
      <div className={styles.stage}>
        <p className={styles.failure} role="alert">
          {t("game.startFailed")}
        </p>
        <Button large variant={ButtonVariant.Primary} onClick={session.nextRound}>
          {t("common.retry")}
        </Button>
        {shortcutHint("game.shortcutConfirm")}
      </div>
    );
  }

  if (loadingTrack || phase === GamePhase.Idle || !track) {
    return (
      <div className={styles.stage}>
        <Spinner showLabel label={t("game.loadingTrack")} />
      </div>
    );
  }

  if (phase === GamePhase.Listening) {
    const secondsLeft = msToWholeSeconds(guessRemainingMs);

    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>
          {t("game.round", { number: round })}
          {state.direction === null ? "" : ` · ${t(`game.direction.${state.direction}`)}`}
        </p>
        <h2 className={styles.headline}>{t("game.listening")}</h2>

        <div className={styles.money} aria-live="off">
          {formatMoney(currentMoney)}
        </div>
        <p className={styles.moneyLabel}>
          {t("game.atStake")} · {secondsLeft} s
        </p>
        <ProgressBar
          instant
          tall
          value={guessRemainingMs}
          max={rules.roundDurationMs}
          ariaLabel={t("game.listening")}
          tone={secondsLeft <= 3 ? ProgressTone.Warning : ProgressTone.Accent}
        />

        <p className={styles.hint}>{t("game.listeningHint")}</p>

        <div className={styles.legend}>
          <span className={styles.legendLabel}>{t("game.keyLegend")}</span>
          {players.map((player) => {
            const muted = state.suspension?.playerIds.includes(player.id) ?? false;

            return (
              <span
                key={player.id}
                className={
                  muted ? `${styles.legendItem} ${styles.legendItemMuted}` : styles.legendItem
                }
              >
                <Keycap keyCode={player.keyCode} emptyLabel="—" muted={muted} />
                <span>{player.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (phase === GamePhase.Buzzed) {
    const secondsLeft = msToWholeSeconds(answerRemainingMs);

    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>{t("game.round", { number: round })}</p>
        <h2 className={styles.headline}>
          {t("game.buzzedBy", { name: buzzedPlayer?.name ?? "" })}
        </h2>
        <p className={styles.captured}>
          {t("game.captured", {
            amount: formatMoney(state.pendingAmount ?? 0),
          })}
        </p>

        <div
          className={
            secondsLeft === 0 ? `${styles.countdown} ${styles.countdownSpent}` : styles.countdown
          }
        >
          {secondsLeft}
        </div>
        <ProgressBar
          instant
          value={answerRemainingMs}
          max={rules.answerDurationMs}
          ariaLabel={t("game.answerWindow")}
          tone={ProgressTone.Accent}
        />

        <p className={styles.hint}>
          {secondsLeft === 0 ? t("game.answerWindowOver") : t("game.sayTitleAndArtist")}
        </p>

        <Button large variant={ButtonVariant.Primary} onClick={session.reveal}>
          {t("game.reveal")}
        </Button>
        {shortcutHint("game.shortcutConfirm")}
      </div>
    );
  }

  if (phase === GamePhase.Revealed) {
    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>{t("game.answerWas")}</p>
        <TrackCard track={track} startPositionMs={startPositionMs} />

        <p className={styles.hint}>{t("game.judgeHint", { name: buzzedPlayer?.name ?? "" })}</p>

        <ButtonGroup ariaLabel={t("game.judgeHint", { name: buzzedPlayer?.name ?? "" })}>
          <Button
            large
            variant={ButtonVariant.Positive}
            onClick={() => session.judge(Verdict.Correct)}
          >
            {t("game.correct")}
          </Button>
          <Button
            large
            variant={ButtonVariant.Negative}
            onClick={() => session.judge(Verdict.Incorrect)}
          >
            {t("game.incorrect")}
          </Button>
        </ButtonGroup>
        {shortcutHint("game.shortcutJudge")}

        {/* The rare third option: wrong, but the table waives the ban. Kept
            small, kept out of the button group the arrows walk, and given no
            shortcut of its own — a slip here would quietly cancel a penalty. */}
        <div className={styles.asideAction}>
          <Button small variant={ButtonVariant.Ghost} onClick={() => session.judge(Verdict.Close)}>
            {t("game.close")}
          </Button>
          <p className={styles.asideHint}>{t("game.closeHint")}</p>
        </div>
      </div>
    );
  }

  // Nobody may answer a tie: the track plays on, and the round that follows is
  // a run-off between whoever pressed together.
  if (phase === GamePhase.Tied) {
    const tiedNames = players
      .filter((player) => state.tiedPlayerIds.includes(player.id))
      .map((player) => player.name);

    return (
      <div className={styles.stage}>
        <h2 className={styles.tie}>{t("game.tie")}</h2>
        <p className={styles.headline}>{t("game.tieWho", { names: tiedNames.join(", ") })}</p>
        <p className={styles.hint}>{t("game.tieExplain")}</p>
        {upcomingLine ? <p className={styles.hint}>{upcomingLine}</p> : null}

        <Button large variant={ButtonVariant.Primary} onClick={session.nextRound}>
          {t("game.nextRound")}
        </Button>
        {shortcutHint("game.shortcutConfirm")}
      </div>
    );
  }

  // An answer has been marked: the verdict and the title go up, the track keeps
  // playing, and the host decides when to move on.
  if (phase === GamePhase.Judged && lastVerdict) {
    const judged = players.find((player) => player.id === lastVerdict.playerId) ?? null;
    const name = judged?.name ?? "";
    const wasCorrect = lastVerdict.verdict === Verdict.Correct;
    const headline =
      lastVerdict.verdict === Verdict.Correct
        ? "game.verdictCorrect"
        : lastVerdict.verdict === Verdict.Close
          ? "game.verdictClose"
          : "game.verdictIncorrect";

    return (
      <div className={styles.stage}>
        <p className={wasCorrect ? styles.verdictCorrect : styles.verdictIncorrect}>
          {t(headline, { name })}
          {" — "}
          {t(wasCorrect ? "game.won" : "game.lost", {
            amount: formatMoney(lastVerdict.amount),
          })}
        </p>
        <TrackCard track={track} startPositionMs={startPositionMs} />
        <TrackScrubber />
        {upcomingLine ? <p className={styles.hint}>{upcomingLine}</p> : null}

        <Button large variant={ButtonVariant.Primary} onClick={session.nextRound}>
          {t("game.nextRound")}
        </Button>
        {shortcutHint("game.shortcutConfirm")}
      </div>
    );
  }

  // Nobody buzzed in: the title goes up and the host moves the game on.
  return (
    <div className={styles.stage}>
      <p className={styles.eyebrow}>{t("game.timeUp")}</p>
      <TrackCard track={track} startPositionMs={startPositionMs} />
      <TrackScrubber />
      {upcomingLine ? <p className={styles.hint}>{upcomingLine}</p> : null}

      <Button large variant={ButtonVariant.Primary} onClick={session.nextRound}>
        {t("game.nextRound")}
      </Button>
      {shortcutHint("game.shortcutConfirm")}
    </div>
  );
}
