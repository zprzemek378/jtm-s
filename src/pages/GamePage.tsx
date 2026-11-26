import { useCallback, useState } from "react";

import { BackendStatus } from "@/backend/BackendContext";
import { useBackend } from "@/backend/useBackend";
import { GameBoard } from "@/components/game/GameBoard";
import { ResumePanel } from "@/components/game/ResumePanel";
import { PlaylistPicker } from "@/components/game/PlaylistPicker";
import { PlayerSetupList } from "@/components/game/PlayerSetupList";
import { SpotifyGate } from "@/components/game/SpotifyGate";
import { UniverseLineUp } from "@/components/universe/UniverseLineUp";
import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/ButtonGroup";
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
import type { GamePlayer, GameRules, PlayerDraft } from "@/game/types";
import { ModePicker } from "@/components/game/ModePicker";
import { ModifierPicker } from "@/components/game/ModifierPicker";
import { formatMoney } from "@/game/rewards";
import { primeSounds } from "@/audio/player";
import { selectionKey } from "@/game/playHistory";
import {
  forgetGame,
  readGameLog,
  resumableGames,
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
 * Which pool the evening is played from.
 *
 * Free play is the game as it has always been: this computer, these people,
 * nothing kept anywhere else. A universe game is the same game played by the
 * people of a universe, and it joins that universe's history.
 */
const Pool = {
  Universe: "universe",
  Free: "free",
} as const;

type Pool = (typeof Pool)[keyof typeof Pool];

/** The pool and universe this machine played last, so it need not be chosen again. */
type PoolChoice = { pool: Pool; universeId: string | null };

function readPoolChoice(): PoolChoice {
  const stored = readStoredJson<PoolChoice>(STORAGE_KEYS.gamePool);

  return {
    pool: stored?.pool === Pool.Universe ? Pool.Universe : Pool.Free,
    universeId: typeof stored?.universeId === "string" ? stored.universeId : null,
  };
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
  /** The universe whose history this game joins, or null for free play. */
  universeId: string | null;
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
   * Games left unfinished on this machine, offered back before a new one is
   * set up. Read once on arrival: the store only changes from here.
   */
  const [unfinished, setUnfinished] = useState<readonly StoredGame[]>(() =>
    resumableGames(readGameLog()),
  );
  const backend = useBackend();
  const [choice, setChoice] = useState<PoolChoice>(readPoolChoice);
  /** Who is at the table tonight, when the people come from a universe. */
  const [universeLineUp, setUniverseLineUp] = useState<readonly PlayerDraft[]>([]);

  // A universe game needs a universe to play in, and one to have been chosen.
  const universes = backend.universes;
  const inUniverse =
    choice.pool === Pool.Universe && backend.status === BackendStatus.Ready && universes.length > 0;
  const universeId = inUniverse ? (choice.universeId ?? universes[0]?.id ?? null) : null;
  const lineUp = universeId ? universeLineUp : setup.players;

  const chooseePool = (pool: Pool, chosenUniverse: string | null = choice.universeId) => {
    const next = { pool, universeId: chosenUniverse };

    setChoice(next);
    writeStoredJson(STORAGE_KEYS.gamePool, next);
  };

  const defaultName = useCallback(
    (index: number) => t("setup.defaultPlayerName", { number: index + 1 }),
    [t],
  );

  const problems = findSetupProblems(lineUp, defaultName);

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
    const players = toGamePlayers(lineUp, defaultName);

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
      universeId,
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
      setUnfinished([]);
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
      universeId: stored.universeId,
      resumed: stored,
    });

  const handleDiscardUnfinished = (stored: StoredGame) => {
    writeGameLog(forgetGame(readGameLog(), stored.id));
    setUnfinished(resumableGames(readGameLog()));
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
            <ResumePanel
              local={unfinished}
              busy={connecting}
              onResume={(game) => void handleResume(game)}
              onDiscard={handleDiscardUnfinished}
            />

            {backend.status === BackendStatus.Ready && universes.length > 0 ? (
              <Panel title={t("universe.pool")}>
                <ButtonGroup ariaLabel={t("universe.pool")}>
                  <Button
                    variant={inUniverse ? ButtonVariant.Primary : ButtonVariant.Secondary}
                    onClick={() => chooseePool(Pool.Universe)}
                  >
                    {t("universe.mode")}
                  </Button>
                  <Button
                    variant={inUniverse ? ButtonVariant.Secondary : ButtonVariant.Primary}
                    onClick={() => chooseePool(Pool.Free)}
                  >
                    {t("universe.freeMode")}
                  </Button>
                </ButtonGroup>

                {inUniverse && universes.length > 1 ? (
                  <div className={styles.poolRow}>
                    <label className={styles.poolLabel} htmlFor="game-universe">
                      {t("universe.pickUniverse")}
                    </label>
                    <select
                      id="game-universe"
                      className={styles.poolSelect}
                      value={universeId ?? ""}
                      onChange={(event) => {
                        chooseePool(Pool.Universe, event.target.value);
                        // The people are a different set now.
                        setUniverseLineUp([]);
                      }}
                    >
                      {universes.map((universe) => (
                        <option key={universe.id} value={universe.id}>
                          {universe.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {!inUniverse ? <p className={styles.poolHint}>{t("universe.freeHint")}</p> : null}
              </Panel>
            ) : null}

            <Panel title={t("setup.step.players")}>
              {universeId ? (
                <UniverseLineUp
                  universeId={universeId}
                  value={universeLineUp}
                  onChange={setUniverseLineUp}
                />
              ) : (
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
              )}
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
                  count: lineUp.length,
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
            universeId={game.universeId}
            resumed={game.resumed}
            onChangeSettings={() => {
              setGame(null);
              // Whatever became of that game, the offer has to be asked again:
              // it was either finished, given up on, or is now one of the
              // stored ones.
              setUnfinished(resumableGames(readGameLog()));
              setStage(Stage.Setup);
            }}
            onPlayersEdited={setup.applyLineUp}
          />
        ) : null}
      </SpotifyGate>
    </div>
  );
}
