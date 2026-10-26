import { useEffect, useRef, useState } from "react";

import type { PooledTrack } from "@/helpers/trackUnion";
import { useLanguage } from "@/i18n/useLanguage";
import { SpotifyError, type PlaylistSummary } from "@/spotify/types";
import { useSpotify } from "@/spotify/useSpotify";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import styles from "./SaveTrack.module.scss";

type SaveTrackProps = {
  track: PooledTrack;
};

/**
 * The account's playlists, kept for as long as the tab stays on one account.
 *
 * Listing them costs a request per fifty, and the host who adds a song to a
 * playlist tends to do it again later in the evening — asking Spotify each
 * time would be the one avoidable cost in this panel.
 */
let cachedPlaylists: { userId: string; playlists: readonly PlaylistSummary[] } | null = null;

/**
 * Lower case and without accents, so "zolte" finds "Żółte" — nobody reaches
 * for the diacritics when they are filtering a list.
 */
function fold(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      // A stroked letter is a letter of its own rather than an accented one, so
      // decomposition leaves it alone and it has to be named.
      .replace(/ł/g, "l")
      .trim()
  );
}

/** What Spotify said, without the method and path this module already knows. */
function refusal(failure: unknown): string | undefined {
  return failure instanceof SpotifyError ? failure.message.split(" — ").pop() : undefined;
}

/** Keeping a song that the room liked: into the library, or onto a playlist. */
export function SaveTrack({ track }: SaveTrackProps) {
  const { t } = useLanguage();
  const { fetchSaved, setSaved, addToPlaylist, playlistHolds, fetchPlaylists, user } = useSpotify();

  /** Null until Spotify has said; true or false once it has. */
  const [saved, setSavedState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [playlists, setPlaylists] = useState<readonly PlaylistSummary[] | null>(null);
  const [note, setNote] = useState<{
    key: "library.added" | "library.alreadyIn" | "library.failed";
    name?: string;
    /** What Spotify itself said, when it is a refusal worth reading. */
    detail?: string;
  } | null>(null);
  /** What has been typed into the playlist filter. */
  const [query, setQuery] = useState("");
  /** Playlists known to hold this track: found there, or put there just now. */
  const [knownOn, setKnownOn] = useState<readonly string[]>([]);
  /** Guards state updates after the round has moved on. */
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;

    return () => {
      liveRef.current = false;
    };
  }, []);

  // One read per revealed track, which is what fills the heart in correctly
  // rather than guessing. A failure leaves it unknown instead of wrong.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setSavedState(null);
    // oxlint-disable-next-line react/set-state-in-effect
    setNote(null);
    // oxlint-disable-next-line react/set-state-in-effect
    setPicking(false);
    // oxlint-disable-next-line react/set-state-in-effect
    setKnownOn([]);

    let current = true;

    const read = async () => {
      try {
        const [isSaved] = await fetchSaved([track.uri]);

        if (current) {
          setSavedState(isSaved ?? false);
        }
      } catch {
        // Nothing to say: the buttons still work, the heart just stays hollow.
      }
    };

    void read();

    return () => {
      current = false;
    };
  }, [fetchSaved, track.uri]);

  /**
   * Whether this playlist is known to hold the track already.
   *
   * Two things are known for nothing: the playlists the game drew this track
   * from, and whatever was added during this round. Spotify has no way to ask
   * "is this track on that playlist" — the only answer is to page through the
   * whole playlist — so a playlist outside both is offered and trusted.
   */
  const holds = (playlistId: string) =>
    track.playlistIds.includes(playlistId) || knownOn.includes(playlistId);

  const needle = fold(query);
  const matching = (playlists ?? []).filter((playlist) => fold(playlist.name).includes(needle));

  const toggleSaved = async () => {
    const next = !saved;

    setBusy(true);
    setNote(null);
    // Answered at once: the request is a formality the room should not watch.
    setSavedState(next);

    try {
      await setSaved(track.uri, next);
    } catch (failure) {
      if (liveRef.current) {
        setSavedState(!next);
        setNote({ key: "library.failed", detail: refusal(failure) });
      }
    } finally {
      if (liveRef.current) {
        setBusy(false);
      }
    }
  };

  const openPicker = async () => {
    setNote(null);
    setQuery("");
    setPicking(!picking);

    if (picking || playlists) {
      return;
    }

    if (cachedPlaylists && cachedPlaylists.userId === user?.id) {
      setPlaylists(cachedPlaylists.playlists);

      return;
    }

    try {
      const loaded = await fetchPlaylists();
      const own = loaded.filter((playlist) => playlist.canModify);

      cachedPlaylists = { userId: user?.id ?? "", playlists: own };

      if (liveRef.current) {
        setPlaylists(own);
      }
    } catch (failure) {
      if (liveRef.current) {
        setPlaylists([]);
        setNote({ key: "library.failed", detail: refusal(failure) });
      }
    }
  };

  const addTo = async (playlist: PlaylistSummary) => {
    setBusy(true);
    setNote(null);

    try {
      // Spotify will hold the same song twice without complaint, and has no
      // way to be asked whether it already does — so the playlist is read
      // through first. A playlist too long to finish reading answers null, and
      // is added to regardless.
      if (await playlistHolds(playlist.id, track.uri)) {
        if (liveRef.current) {
          setKnownOn((current) => [...current, playlist.id]);
          setNote({ key: "library.alreadyIn", name: playlist.name });
        }

        return;
      }

      await addToPlaylist(playlist.id, track.uri);

      if (liveRef.current) {
        setKnownOn((current) => [...current, playlist.id]);
        setPicking(false);
        setNote({ key: "library.added", name: playlist.name });
      }
    } catch (failure) {
      if (liveRef.current) {
        setNote({ key: "library.failed", detail: refusal(failure) });
      }
    } finally {
      if (liveRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.actions}>
        <Button
          className={styles.action}
          variant={saved ? ButtonVariant.Primary : ButtonVariant.Secondary}
          // Not disabled when the state is unknown: the read can fail for
          // reasons the write would not, and a dead button says nothing.
          disabled={busy}
          onClick={() => void toggleSaved()}
        >
          <span aria-hidden="true">{saved ? "♥" : "♡"}</span>{" "}
          {t(saved ? "library.saved" : "library.save")}
        </Button>

        <Button
          className={styles.action}
          variant={ButtonVariant.Secondary}
          active={picking}
          disabled={busy}
          onClick={() => void openPicker()}
        >
          {t("library.addToPlaylist")}
        </Button>
      </div>

      {picking ? (
        <div className={styles.picker} aria-label={t("library.pickPlaylist")}>
          {playlists === null ? (
            <Spinner showLabel label={t("common.loading")} />
          ) : playlists.length === 0 ? (
            <p className={styles.empty}>{t("library.noPlaylists")}</p>
          ) : (
            <>
              <Input
                label={t("playlist.minePlaceholder")}
                hideLabel
                type="search"
                // The picker only exists because the host just asked for it,
                // and the field is the first thing they want. Typing here also
                // keeps the game's own shortcuts quiet, so a playlist called
                // "Enter" costs nobody a round.
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={query}
                placeholder={t("playlist.minePlaceholder")}
                onChange={(event) => setQuery(event.target.value)}
              />

              {matching.length === 0 ? (
                <p className={styles.empty}>{t("library.noMatches")}</p>
              ) : (
                <ul className={styles.list}>
                  {matching.map((playlist) => {
                    const already = holds(playlist.id);

                    return (
                      <li key={playlist.id}>
                        <button
                          type="button"
                          className={already ? `${styles.item} ${styles.itemHas}` : styles.item}
                          disabled={already || busy}
                          title={already ? t("library.alreadyOn") : undefined}
                          onClick={() => void addTo(playlist)}
                        >
                          {playlist.imageUrl ? (
                            <img
                              className={styles.cover}
                              src={playlist.imageUrl}
                              alt=""
                              width={32}
                              height={32}
                            />
                          ) : (
                            <span className={styles.coverFallback} aria-hidden="true">
                              ♪
                            </span>
                          )}
                          <span className={styles.itemText}>
                            <span className={styles.itemName}>{playlist.name}</span>
                            <span className={styles.itemMeta}>
                              {already
                                ? t("library.alreadyOn")
                                : t("playlist.trackCount", { count: playlist.trackCount })}
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
        </div>
      ) : null}

      {note ? (
        <p className={note.key === "library.failed" ? styles.failed : styles.note}>
          {t(note.key, { name: note.name ?? "" })}
          {note.detail ? ` ${note.detail}` : ""}
        </p>
      ) : null}
    </div>
  );
}
