import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MIN_TRACK_DURATION_MS } from "@/constants/gameRules";
import { SCAN_MAX_JUMPS } from "@/constants/spotify";
import { formatSharePercent } from "@/helpers/format";
import { parsePlaylistId } from "@/helpers/playlistUrl";
import { unionTracks, type PooledTrack } from "@/helpers/trackUnion";
import type { LanguageContextValue } from "@/i18n/LanguageContext";
import { useLanguage } from "@/i18n/useLanguage";
import { isSafeModeEnabled } from "@/settings/safeMode";
import { partitionRestorable, type Chosen, type Selection } from "./playlistSelection";
import {
  SkipReason,
  SpotifyError,
  SpotifyErrorKind,
  totalSkipped,
  type PlaylistSummary,
  type PlaylistTracks,
  type SkipCounts,
} from "@/spotify/types";
import { useSpotify } from "@/spotify/useSpotify";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";
import { Spinner } from "../ui/Spinner";
import styles from "./PlaylistPicker.module.scss";

type Translate = LanguageContextValue["t"];

type PlaylistPickerProps = {
  /** Playlists chosen for a previous game, restored on mount. */
  initialPlaylistIds?: readonly string[];
  onStart: (playlists: readonly PlaylistSummary[], tracks: readonly PooledTrack[]) => void;
};

/** Turns an API failure into the most specific message we can justify. */
function describeTrackFailure(failure: unknown, t: Translate): string {
  if (!(failure instanceof SpotifyError)) {
    return t("spotify.error.request", { status: 0 });
  }

  if (failure.kind === SpotifyErrorKind.NotFound) {
    return t("playlist.error.notFound");
  }

  if (failure.kind === SpotifyErrorKind.Forbidden) {
    return t("playlist.error.forbidden");
  }

  if (failure.kind === SpotifyErrorKind.RateLimited) {
    return t("spotify.error.rateLimited");
  }

  return t("spotify.error.request", { status: failure.status });
}

/** Lists only the reasons that actually applied, in a fixed, readable order. */
function describeSkips(skipped: SkipCounts, minSeconds: number, t: Translate): string {
  const order: SkipReason[] = [
    SkipReason.Removed,
    SkipReason.Unavailable,
    SkipReason.NotATrack,
    SkipReason.Local,
    SkipReason.TooShort,
    SkipReason.Duplicate,
  ];

  return order
    .filter((reason) => skipped[reason] > 0)
    .map((reason) =>
      t(`playlist.skipped.${reason}`, {
        count: skipped[reason],
        seconds: minSeconds,
      }),
    )
    .join(", ")
    .concat(".");
}

/**
 * Picks the playlists a game runs on — any number of them, from the account's
 * own or from pasted links. Their tracks are merged into one pool.
 */
export function PlaylistPicker({ initialPlaylistIds = [], onStart }: PlaylistPickerProps) {
  const { t } = useLanguage();
  const { fetchPlaylists, fetchPlaylistById, fetchTracks, scanPlaylist } = useSpotify();
  // Read once: the switch lives in Settings, and coming back here remounts.
  const [safeMode] = useState(isSafeModeEnabled);

  const [playlists, setPlaylists] = useState<readonly PlaylistSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  /** Keyed by playlist id, so a row can find its own state in one lookup. */
  const [chosen, setChosen] = useState<Selection>({});
  /** The selection as it was before it was cleared, for one step of undo. */
  const [undoable, setUndoable] = useState<Selection | null>(null);

  const minSeconds = Math.round(MIN_TRACK_DURATION_MS / 1000);

  useEffect(() => {
    let cancelled = false;

    fetchPlaylists()
      .then((items) => {
        if (!cancelled) {
          setPlaylists(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlaylists([]);
          setListError(t("playlist.error.notFound"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPlaylists, t]);

  /** Replaces one entry, but only while it is still part of the selection. */
  const updateChosen = useCallback((playlistId: string, patch: Partial<Chosen>) => {
    setChosen((current) => {
      const entry = current[playlistId];

      return entry ? { ...current, [playlistId]: { ...entry, ...patch } } : current;
    });
  }, []);

  const add = useCallback(
    async (playlist: PlaylistSummary) => {
      setUndoable(null);

      const pending: Chosen = {
        playlist,
        tracks: null,
        error: null,
        scan: null,
        truncated: false,
        cached: false,
      };

      // A playlist the API will not list can still be read by playing it, but
      // only when the host has accepted the rate-limit risk in Settings.
      if (!playlist.canReadContents && safeMode) {
        setChosen((current) => ({
          ...current,
          [playlist.id]: { ...pending, error: t("playlist.error.forbidden") },
        }));

        return;
      }

      const scanning = !playlist.canReadContents;

      setChosen((current) => ({
        ...current,
        [playlist.id]: {
          ...pending,
          scan: scanning ? { collected: 0, jump: 0, maxJumps: SCAN_MAX_JUMPS } : null,
        },
      }));

      try {
        if (scanning) {
          const result = await scanPlaylist(playlist.id, (progress) =>
            updateChosen(playlist.id, { scan: progress }),
          );

          updateChosen(playlist.id, {
            tracks: { tracks: result.tracks, skipped: result.skipped },
            scan: null,
            truncated: result.truncated,
            cached: result.fromCache,
            error:
              result.tracks.length === 0
                ? t("playlist.error.tooFewTracks", { seconds: minSeconds })
                : null,
          });

          return;
        }

        const loaded = await fetchTracks(playlist.id);

        updateChosen(playlist.id, {
          tracks: loaded,
          error:
            loaded.tracks.length === 0
              ? t("playlist.error.tooFewTracks", { seconds: minSeconds })
              : null,
        });
      } catch (failure) {
        const message = describeTrackFailure(failure, t);

        updateChosen(playlist.id, {
          tracks: null,
          scan: null,
          error: scanning ? t("playlist.scanFailed", { message }) : message,
        });
      }
    },
    [fetchTracks, minSeconds, safeMode, scanPlaylist, t, updateChosen],
  );

  const remove = useCallback((playlistId: string) => {
    setUndoable(null);
    setChosen((current) => {
      const { [playlistId]: _removed, ...rest } = current;

      return rest;
    });
  }, []);

  const clearSelection = useCallback(() => {
    // Read outside an updater: React may run an updater twice, and remembering
    // the selection is not something to do twice.
    setUndoable(Object.keys(chosen).length > 0 ? chosen : null);
    setChosen({});
  }, [chosen]);

  const undoClear = useCallback(() => {
    if (!undoable) {
      return;
    }

    // Entries that had finished go back exactly as they were, which costs no
    // requests; anything abandoned mid-request is asked for again.
    const { settled, unsettled } = partitionRestorable(undoable);

    setChosen(settled);
    setUndoable(null);

    for (const playlist of unsettled) {
      void add(playlist);
    }
  }, [add, undoable]);

  const addById = useCallback(
    async (playlistId: string) => {
      try {
        await add(await fetchPlaylistById(playlistId));
      } catch {
        setLinkError(t("playlist.error.notFound"));
      }
    },
    [add, fetchPlaylistById, t],
  );

  // Restore the previous game's selection. Keyed on nothing: it runs for the
  // ids the screen opened with and must not fire again as the host edits them.
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || initialPlaylistIds.length === 0) {
      return;
    }

    restoredRef.current = true;

    for (const playlistId of initialPlaylistIds) {
      // Restoring means fetching each playlist from Spotify, which is the
      // external system an effect is for; the synchronous part is only the
      // "loading" row the host sees while it arrives.
      // oxlint-disable-next-line react/set-state-in-effect
      void addById(playlistId);
    }
  }, [addById, initialPlaylistIds]);

  const handleLoadLink = () => {
    const playlistId = parsePlaylistId(link);

    if (!playlistId) {
      setLinkError(t("playlist.error.invalidLink"));

      return;
    }

    setLinkError(null);
    setLink("");
    void addById(playlistId);
  };

  const visiblePlaylists = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    if (!playlists) {
      return [];
    }

    const matching =
      needle.length === 0
        ? playlists
        : playlists.filter((playlist) => playlist.name.toLowerCase().includes(needle));

    // Playable ones first. An account can follow far more playlists than it
    // owns, and the rest cannot be chosen, so burying the usable ones among
    // them means scrolling past rows that do nothing. Sorting is stable, so
    // within each group Spotify's own order is kept.
    return [...matching].sort(
      (left, right) => Number(right.canReadContents) - Number(left.canReadContents),
    );
  }, [filter, playlists]);

  const chosenList = useMemo(() => Object.values(chosen), [chosen]);

  const union = useMemo(
    () =>
      unionTracks(
        chosenList
          .filter((entry): entry is Chosen & { tracks: PlaylistTracks } => entry.tracks !== null)
          .map((entry) => ({
            playlistName: entry.playlist.name,
            tracks: entry.tracks,
          })),
      ),
    [chosenList],
  );

  const stillLoading = chosenList.some((entry) => entry.tracks === null && entry.error === null);

  return (
    <div className={styles.picker}>
      <Panel
        title={t("playlist.mine")}
        meta={
          playlists
            ? `${t("playlist.playlistCount", { count: playlists.length })} · ${t(
                "playlist.availableCount",
                {
                  count: playlists.filter((playlist) => playlist.canReadContents).length,
                },
              )}`
            : undefined
        }
      >
        {playlists === null ? (
          <Spinner showLabel label={t("playlist.mineLoading")} />
        ) : (
          <>
            <p className={styles.note}>{t("playlist.multiHint")}</p>
            <p className={styles.note}>
              {safeMode ? t("playlist.ownOnly") : t("playlist.unsafeModeOn")}
            </p>

            <Input
              label={t("playlist.minePlaceholder")}
              hideLabel
              type="search"
              value={filter}
              placeholder={t("playlist.minePlaceholder")}
              onChange={(event) => setFilter(event.target.value)}
            />

            {listError ? <p className={styles.error}>{listError}</p> : null}

            {visiblePlaylists.length === 0 ? (
              <p className={styles.empty}>{t("playlist.mineEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {visiblePlaylists.map((playlist) => {
                  const isChosen = playlist.id in chosen;

                  return (
                    <li key={playlist.id}>
                      <button
                        type="button"
                        className={[
                          styles.item,
                          isChosen ? styles.itemActive : null,
                          !playlist.canReadContents && safeMode ? styles.itemBlocked : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={safeMode && !playlist.canReadContents}
                        onClick={() => (isChosen ? remove(playlist.id) : void add(playlist))}
                        aria-pressed={isChosen}
                        title={
                          playlist.canReadContents
                            ? undefined
                            : safeMode
                              ? t("playlist.notYours")
                              : t("playlist.scanHint")
                        }
                      >
                        <span className={styles.check} aria-hidden="true">
                          {isChosen ? "✓" : ""}
                        </span>
                        {playlist.imageUrl ? (
                          <img
                            className={styles.cover}
                            src={playlist.imageUrl}
                            alt=""
                            width={40}
                            height={40}
                          />
                        ) : (
                          <span className={styles.coverFallback} aria-hidden="true">
                            ♪
                          </span>
                        )}
                        <span className={styles.itemText}>
                          <strong className={styles.itemName}>{playlist.name}</strong>
                          <span className={styles.itemMeta}>
                            {t("playlist.owner", { name: playlist.ownerName })}
                            {playlist.trackCount > 0
                              ? ` · ${t("playlist.trackCount", { count: playlist.trackCount })}`
                              : ""}
                            {playlist.canReadContents
                              ? ""
                              : ` · ${safeMode ? t("playlist.notYours") : t("playlist.scan")}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Panel>

      <Panel title={t("playlist.paste")}>
        <div className={styles.linkRow}>
          <Input
            className={styles.linkInput}
            label={t("playlist.paste")}
            hideLabel
            value={link}
            placeholder={t("playlist.pastePlaceholder")}
            error={linkError ?? undefined}
            onChange={(event) => {
              setLink(event.target.value);
              setLinkError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleLoadLink();
              }
            }}
          />
          <Button variant={ButtonVariant.Secondary} onClick={handleLoadLink}>
            {t("playlist.load")}
          </Button>
        </div>
      </Panel>

      <Panel
        title={t("playlist.selected")}
        meta={t("playlist.selectedCount", { count: chosenList.length })}
        actions={
          <Button
            small
            variant={ButtonVariant.Ghost}
            disabled={chosenList.length === 0}
            onClick={clearSelection}
          >
            {t("playlist.clearSelection")}
          </Button>
        }
      >
        {undoable ? (
          <div className={styles.undoRow} role="status">
            <span>{t("playlist.cleared", { count: Object.keys(undoable).length })}</span>
            <Button small variant={ButtonVariant.Secondary} onClick={undoClear}>
              {t("playlist.undoClear")}
            </Button>
          </div>
        ) : null}

        {chosenList.length === 0 ? (
          <p className={styles.empty}>{t("playlist.noneSelected")}</p>
        ) : (
          <ul className={styles.chosenList}>
            {chosenList.map(({ playlist, tracks, error, scan, truncated, cached }) => (
              <li key={playlist.id} className={styles.chosenRow}>
                <span className={styles.itemText}>
                  <strong className={styles.itemName}>{playlist.name}</strong>
                  <span className={error ? styles.error : styles.itemMeta}>
                    {error ??
                      (scan
                        ? t("playlist.scanning", {
                            count: scan.collected,
                            jump: scan.jump,
                            max: scan.maxJumps,
                          })
                        : tracks
                          ? t("playlist.playableHere", {
                              count: tracks.tracks.length,
                            }) + (cached ? ` · ${t("playlist.scanCached")}` : "")
                          : t("common.loading"))}
                  </span>
                  {truncated && tracks ? (
                    <span className={styles.itemMeta}>
                      {t("playlist.scanTruncated", {
                        count: tracks.tracks.length,
                      })}
                    </span>
                  ) : null}
                </span>
                <Button
                  small
                  iconOnly
                  variant={ButtonVariant.Ghost}
                  onClick={() => remove(playlist.id)}
                  title={t("playlist.removeFromSelection", {
                    name: playlist.name,
                  })}
                  aria-label={t("playlist.removeFromSelection", {
                    name: playlist.name,
                  })}
                >
                  <span aria-hidden="true">✕</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {stillLoading ? <Spinner showLabel label={t("common.loading")} /> : null}

        {union.tracks.length > 0 ? (
          <>
            <p className={styles.summary}>
              {t("playlist.unionTotal", { count: union.tracks.length })}
            </p>
            <p className={styles.note}>
              {t("playlist.equalChance", {
                percent: formatSharePercent(union.tracks.length),
              })}
            </p>
            {union.duplicateCount > 0 ? (
              <p className={styles.note}>
                {t("playlist.duplicatesRemoved", {
                  count: union.duplicateCount,
                })}
              </p>
            ) : null}
            {totalSkipped(union.skipped) > 0 ? (
              <p className={styles.note}>
                {t("playlist.skipped.intro", {
                  count: totalSkipped(union.skipped),
                })}{" "}
                {describeSkips(union.skipped, minSeconds, t)}
              </p>
            ) : null}
            <Button
              large
              variant={ButtonVariant.Primary}
              disabled={stillLoading}
              onClick={() =>
                onStart(
                  chosenList.map((entry) => entry.playlist),
                  union.tracks,
                )
              }
            >
              {t("playlist.startGame")}
            </Button>
          </>
        ) : null}
      </Panel>
    </div>
  );
}
