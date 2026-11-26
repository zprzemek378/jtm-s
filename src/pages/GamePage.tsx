import { useCallback, useState } from "react";

import { GameBoard } from "@/components/game/GameBoard";
import { PlaylistPicker } from "@/components/game/PlaylistPicker";
import { PlayerSetupList } from "@/components/game/PlayerSetupList";
import { SpotifyGate } from "@/components/game/SpotifyGate";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/Spinner";
import {
  MAX_ANSWER_SECONDS,
  MAX_ROUND_SECONDS,
  MAX_TARGET_MONEY,
  MIN_ANSWER_SECONDS,
  MIN_ROUND_SECONDS,
  MIN_TARGET_MONEY,
  TARGET_MONEY_STEP,
} from "@/constants/gameRules";
import type { GamePlayer, GameRules } from "@/game/types";
import { ModePicker } from "@/components/game/ModePicker";
import { ModifierPicker } from "@/components/game/ModifierPicker";
import { formatMoney } from "@/game/rewards";
import { primeSounds } from "@/audio/player";
import { selectionKey } from "@/game/playHistory";
import {
  forgetGame,
  readGameLog,
  resumableGame,
  writeGameLog,
  type StoredGame,
} from "@/game/gameStore";
import { toGameRules } from "@/game/rules";
import { activeTieThreshold } from "@/settings/ties";
import { useGameSetup } from "@/game/useGameSetup";
import { findSetupProblems, SetupProblem, toGamePlayers } from "@/helpers/playerSetup";
import { useLanguage } from "@/i18n/useLanguage";
import type { PooledTrack } from "@/helpers/trackUnion";
import type { PlaylistSummary } from "@/spotify/types";
import { useSpotify } from "@/spotify/useSpotify";
import { STORAGE_KEYS, readStoredJson, writeStoredJson } from "@/storage/localStorage";

import styles from "./GamePage.module.scss";

/**
 * Playlists the previous game used. Read once at module scope so the picker
 * receives a stable array — a new one on every render would keep retriggering
 * the restore.
 */
function readRestoredPlaylistIds(): readonly string[] {
  const stored = readStoredJson<unknown>(STORAGE_KEYS.playlists);

  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

/**
 * Which round a stored game was in the middle of.
 *
 * The interrupted round is given up on when the game is picked up again, so
 * what the host is offered is the round they are about to play.
 */
function resumedRound(stored: StoredGame): number {
  return stored.events.filter((event) => event.action.type === "start-round").length;
}

/** Which screen of the game flow is on show. */
const Stage = {
  Setup: "setup",
  Playlist: "playlist",
  Play: "play",
} as const;

type Stage = (typeof Stage)[keyof typeof Stage];

/** The line-up, rules and playlist a running game was started with. */
type StartedGame = {
  players: readonly GamePlayer[];
  rules: GameRules;
  tracks: readonly PooledTrack[];
  /** The playlist selection this game runs on, for the no-repeats history. */
  historyKey: string;
  /** The stored game this one is carrying on from, if it is one. */
  resumed: StoredGame | null;
};

export function GamePage() {
  const { t } = useLanguage();
  const setup = useGameSetup();
  const { connectPlayer, error: spotifyError, clearError } = useSpotify();

  const [stage, setStage] = useState<Stage>(Stage.Setup);
  const [restoredPlaylistIds] = useState(readRestoredPlaylistIds);
  const [game, setGame] = useState<StartedGame | null>(null);
  const [connecting, setConnecting] = useState(false);
  /**
   * A game left unfinished on this machine, offered back before a new one is
   * set up. Read once on arrival: the store only changes from here.
   */
  const [unfinished, setUnfinished] = useState<StoredGame | null>(() =>
    resumableGame(readGameLog()),
  );

  const defaultName = useCallback(
    (index: number) => t("setup.defaultPlayerName", { number: index + 1 }),
    [t],
  );

  const problems = findSetupProblems(setup.players, defaultName);

  const handleContinue = () => {
    if (problems.length > 0) {
      return;
    }

    setStage(Stage.Playlist);
  };

  const handleStart = async (
    chosenPlaylists: readonly PlaylistSummary[],
    tracks: readonly PooledTrack[],
  ) => {
    const players = toGamePlayers(setup.players, defaultName);

    if (!players) {
      setStage(Stage.Setup);

      return;
    }

    writeStoredJson(
      STORAGE_KEYS.playlists,
      chosenPlaylists.map((playlist) => playlist.id),
    );
    await connectAndPlay({
      players,
      rules: toGameRules(setup.setup, activeTieThreshold()),
      tracks,
      historyKey: selectionKey(chosenPlaylists.map((playlist) => playlist.id)),
      resumed: null,
    });
  };

  /**
   * Boots the browser player and starts the game, inside the click that asked
   * for it — browsers only allow audio to start from a user gesture, and the
   * game's own cues are fetched in the same breath for the same reason.
   */
  const connectAndPlay = async (started: StartedGame) => {
    clearError();
    setConnecting(true);

    try {
      primeSounds();
      await connectPlayer();
      setGame(started);
      setUnfinished(null);
      setStage(Stage.Play);
    } catch {
      // connectPlayer has already put the reason in the Spotify context.
    } finally {
      setConnecting(false);
    }
  };

  const handleResume = (stored: StoredGame) =>
    connectAndPlay({
      // The game that was interrupted is played by its own line-up and rules,
      // whatever the setup screen happens to be showing now.
      players: stored.origin.players,
      rules: stored.origin.rules,
      tracks: stored.catalogue,
      historyKey: stored.historyKey,
      resumed: stored,
    });

  const handleDiscardUnfinished = (stored: StoredGame) => {
    writeGameLog(forgetGame(readGameLog(), stored.id));
    setUnfinished(null);
  };

  const errorMessage = spotifyError ? t(spotifyError.key, spotifyError.params) : null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{stage === Stage.Play ? t("nav.game") : t("setup.title")}</h1>

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <SpotifyGate>
        {stage === Stage.Setup ? (
          <div className={styles.stack}>
            {unfinished ? (
              <Panel title={t("resume.title")}>
                <p className={styles.resumeLead}>{t("resume.lead")}</p>
                <p className={styles.resumeDetail}>
                  {t("resume.detail", {
                    round: resumedRound(unfinished),
                    names: unfinished.origin.players.map((player) => player.name).join(", "),
                  })}
                </p>
                <div className={styles.resumeActions}>
                  <Button
                    variant={ButtonVariant.Primary}
                    disabled={connecting}
                    onClick={() => void handleResume(unfinished)}
                  >
                    {t("resume.continue")}
                  </Button>
                  <Button
                    variant={ButtonVariant.Ghost}
                    disabled={connecting}
                    onClick={() => handleDiscardUnfinished(unfinished)}
                  >
                    {t("resume.discard")}
                  </Button>
                </div>
                {connecting ? <Spinner showLabel label={t("spotify.playerConnecting")} /> : null}
              </Panel>
            ) : null}

            <Panel title={t("setup.step.players")}>
              <PlayerSetupList
                players={setup.players}
                defaultName={defaultName}
                onRename={setup.rename}
                onAssignKey={setup.assignKey}
                onSetColour={setup.setColour}
                onMove={setup.movePlayer}
                onAdd={setup.addPlayer}
                onRemove={setup.removePlayer}
              />
            </Panel>

            <Panel title={t("setup.mode")}>
              <ModePicker value={setup.mode} onChange={setup.setMode} />
            </Panel>

            <Panel title={t("setup.modifiers")}>
              <ModifierPicker value={setup.modifiers} onChange={setup.setModifiers} />
            </Panel>

            <Panel title={t("setup.targetMoney")}>
              <NumberStepper
                value={setup.targetMoney}
                min={MIN_TARGET_MONEY}
                max={MAX_TARGET_MONEY}
                step={TARGET_MONEY_STEP}
                onChange={setup.setTargetMoney}
                label={t("setup.targetMoney")}
                hint={t("setup.targetMoneyHint")}
                decreaseLabel={`−${TARGET_MONEY_STEP}`}
                increaseLabel={`+${TARGET_MONEY_STEP}`}
                format={formatMoney}
              />

              <NumberStepper
                value={setup.roundSeconds}
                min={MIN_ROUND_SECONDS}
                max={MAX_ROUND_SECONDS}
                onChange={setup.setRoundSeconds}
                label={t("setup.roundSeconds")}
                hint={t("setup.roundSecondsHint")}
                decreaseLabel="−1"
                increaseLabel="+1"
                format={(value) => t("setup.seconds", { count: value })}
              />

              <NumberStepper
                value={setup.answerSeconds}
                min={MIN_ANSWER_SECONDS}
                max={MAX_ANSWER_SECONDS}
                onChange={setup.setAnswerSeconds}
                label={t("setup.answerSeconds")}
                hint={t("setup.answerSecondsHint")}
                decreaseLabel="−1"
                increaseLabel="+1"
                format={(value) => t("setup.seconds", { count: value })}
              />
            </Panel>

            {problems.includes(SetupProblem.MissingKeys) ? (
              <p className={styles.problem}>{t("setup.missingKeys")}</p>
            ) : null}
            {problems.includes(SetupProblem.DuplicateNames) ? (
              <p className={styles.problem}>{t("setup.duplicateNames")}</p>
            ) : null}
            {problems.includes(SetupProblem.ReservedKeys) ? (
              <p className={styles.problem}>{t("setup.reservedKeysAssigned")}</p>
            ) : null}

            <div>
              <Button
                large
                variant={ButtonVariant.Primary}
                disabled={problems.length > 0}
                onClick={handleContinue}
              >
                {t("setup.continue")}
              </Button>
            </div>
          </div>
        ) : null}

        {stage === Stage.Playlist ? (
          <div className={styles.stack}>
            <div className={styles.summaryRow}>
              <span className={styles.summary}>
                {t("setup.summary", {
                  count: setup.players.length,
                  target: formatMoney(setup.targetMoney),
                })}
              </span>
              <Button
                small
                variant={ButtonVariant.Ghost}
                onClick={() => setStage(Stage.Setup)}
                disabled={connecting}
              >
                {t("common.back")}
              </Button>
            </div>

            <PlaylistPicker
              initialPlaylistIds={restoredPlaylistIds}
              onStart={(chosenPlaylists, tracks) => void handleStart(chosenPlaylists, tracks)}
            />

            {connecting ? <Spinner showLabel label={t("spotify.playerConnecting")} /> : null}
          </div>
        ) : null}

        {stage === Stage.Play && game ? (
          <GameBoard
            players={game.players}
            rules={game.rules}
            tracks={game.tracks}
            historyKey={game.historyKey}
            resumed={game.resumed}
            onChangeSettings={() => {
              setGame(null);
              // Whatever became of that game, the offer has to be asked again:
              // it was either finished, given up on, or is now the stored one.
              setUnfinished(resumableGame(readGameLog()));
              setStage(Stage.Setup);
            }}
            onPlayersEdited={setup.applyLineUp}
          />
        ) : null}
      </SpotifyGate>
    </div>
  );
}
