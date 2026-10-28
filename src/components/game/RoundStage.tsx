import type { CSSProperties } from "react";

import { lyricLinesFor } from "@/game/lyricsRound";
import { formatMoney, RewardDirection } from "@/game/rewards";
import type { GameSession } from "@/game/useGameSession";
import { GamePhase, Verdict, type GamePlayer, type GameRules } from "@/game/types";
import { EXTRA_TIME_MS } from "@/constants/gameRules";
import { msToWholeSeconds } from "@/helpers/format";
import { useActionKeys } from "@/hooks/useActionKeys";
import { useCountdown } from "@/hooks/useCountdown";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonGroup } from "../ui/ButtonGroup";
import { ButtonVariant } from "../ui/buttonVariant";
import { ProgressBar } from "../ui/ProgressBar";
import { ProgressTone } from "../ui/progressTone";
import { Spinner } from "../ui/Spinner";
import { AnswerBlock } from "./AnswerBlock";
import { LyricsRound } from "./LyricsRound";
import { TitleChoice } from "./TitleChoice";
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
    extraTimeRemainingMs,
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

  // Asked for by the session as the count-in starts, because whether there are
  // any decides what kind of round this is.
  const { lyrics } = session;
  const lyricLines = state.lyricsOnly ? lyricLinesFor(lyrics) : null;

  const buzzedPlayer = players.find((player) => player.id === buzzedPlayerId) ?? null;

  // Bound before the phase branches below, because hooks cannot live behind a
  // return. Each phase offers whichever of the two actions it actually has.
  const { tooSoon } = useActionKeys(
    preRollActive
      ? {}
      : startFailed
        ? { onConfirm: session.nextRound }
        : phase === GamePhase.ExtraTime || phase === GamePhase.Titles
          ? {}
          : phase === GamePhase.Buzzed
            ? { onConfirm: session.reveal }
            : phase === GamePhase.Revealed
              ? {
                  onConfirm: () => session.judge(Verdict.Correct),
                  onReject: () => session.judge(Verdict.Incorrect),
                }
              : phase === GamePhase.TimedOut ||
                  phase === GamePhase.Judged ||
                  phase === GamePhase.Tied
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
        <h2 className={styles.headline}>
          {t(state.lyricsOnly ? "game.reading" : "game.listening")}
        </h2>

        <div className={styles.money} aria-live="off">
          {formatMoney(currentMoney)}
        </div>
        <p className={styles.secondsLeft}>{secondsLeft} s</p>
        <ProgressBar
          instant
          tall
          value={guessRemainingMs}
          max={rules.roundDurationMs}
          ariaLabel={t("game.listening")}
          tone={secondsLeft <= 3 ? ProgressTone.Warning : ProgressTone.Accent}
        />

        {lyricLines ? (
          <LyricsRound
            lines={lyricLines}
            from={state.lyricsFrom}
            elapsedMs={rules.roundDurationMs - guessRemainingMs}
            frozenCount={null}
          />
        ) : null}
      </div>
    );
  }

  // The other lifeline: six titles, and the pick is the answer.
  if (phase === GamePhase.Titles) {
    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>{t("game.titles", { count: state.titleOptions.length })}</p>
        <h2 className={styles.headline}>
          {buzzedPlayer ? (
            <span
              className={styles.buzzedName}
              style={{ "--player-colour": buzzedPlayer.colour } as CSSProperties}
            >
              {buzzedPlayer.name}
            </span>
          ) : null}
        </h2>

        <TitleChoice options={state.titleOptions} onPick={session.pickTitle} />
      </div>
    );
  }

  // Bought with a lifeline: the music is back on, and the only thing anybody
  // else can do is listen along.
  if (phase === GamePhase.ExtraTime) {
    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>
          {t("game.extraTime", { seconds: Math.round(EXTRA_TIME_MS / 1000) })}
        </p>
        <h2 className={styles.headline}>
          {t("game.extraTimeRunning", { name: buzzedPlayer?.name ?? "" })}
        </h2>

        <div className={styles.money} aria-live="off">
          {msToWholeSeconds(extraTimeRemainingMs)}
        </div>

        <ProgressBar
          instant
          tall
          value={extraTimeRemainingMs}
          max={EXTRA_TIME_MS}
          ariaLabel={t("game.extraTime", { seconds: Math.round(EXTRA_TIME_MS / 1000) })}
          tone={ProgressTone.Accent}
        />

        {lyricLines ? (
          <LyricsRound
            lines={lyricLines}
            from={state.lyricsFrom}
            // The seconds it bought buy more words, on a round made of them.
            elapsedMs={EXTRA_TIME_MS - extraTimeRemainingMs}
            frozenCount={null}
            startedAt={state.lyricsShown}
          />
        ) : null}
      </div>
    );
  }

  if (phase === GamePhase.Buzzed) {
    const secondsLeft = msToWholeSeconds(answerRemainingMs);

    return (
      <div className={styles.stage}>
        <p className={styles.eyebrow}>{t("game.round", { number: round })}</p>
        <h2 className={styles.headline}>
          {buzzedPlayer ? (
            <span
              className={styles.buzzedName}
              style={{ "--player-colour": buzzedPlayer.colour } as CSSProperties}
            >
              {buzzedPlayer.name}
            </span>
          ) : null}{" "}
          {t("game.buzzedIn")}
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
        {lyricLines ? (
          <LyricsRound
            lines={lyricLines}
            from={state.lyricsFrom}
            elapsedMs={0}
            frozenCount={state.lyricsShown}
          />
        ) : null}

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
        <AnswerBlock
          track={track}
          startPositionMs={startPositionMs}
          lyrics={lyrics}
          className={styles.answerSlot}
        />

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

  // Nobody may answer a tie, so the round is over: the title goes up and the
  // track plays on under it, exactly as when the clock runs out. The round that
  // follows is a run-off between whoever pressed together.
  if (phase === GamePhase.Tied) {
    const tiedNames = players
      .filter((player) => state.tiedPlayerIds.includes(player.id))
      .map((player) => player.name);

    return (
      <div className={styles.stage}>
        <h2 className={styles.tie}>{t("game.tie")}</h2>
        <p className={styles.headline}>{t("game.tieWho", { names: tiedNames.join(", ") })}</p>
        <p className={styles.hint}>{t("game.tieExplain")}</p>

        <AnswerBlock
          track={track}
          startPositionMs={startPositionMs}
          lyrics={lyrics}
          scrubber
          className={styles.answerSlot}
        />
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
        <AnswerBlock
          track={track}
          startPositionMs={startPositionMs}
          lyrics={lyrics}
          scrubber
          className={styles.answerSlot}
        />
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
      <AnswerBlock
        track={track}
        startPositionMs={startPositionMs}
        lyrics={lyrics}
        scrubber
        className={styles.answerSlot}
      />
      {upcomingLine ? <p className={styles.hint}>{upcomingLine}</p> : null}

      <Button large variant={ButtonVariant.Primary} onClick={session.nextRound}>
        {t("game.nextRound")}
      </Button>
      {shortcutHint("game.shortcutConfirm")}
    </div>
  );
}
