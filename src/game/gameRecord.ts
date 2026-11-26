// Reading a game back from the backend.
//
// The backend never looks inside a game: the rules, the line-up and the track
// titles went up as the client's own JSON and come back as `unknown`. This is
// where that becomes a game again — carefully, because what comes back has
// been through a database and may have been written by an older version of
// this app than the one reading it.

import type { PooledTrack } from "@/helpers/trackUnion";

import type { GameOrigin } from "./eventLog";
import type { LoggedAction, LoggedEvent } from "./eventLog";
import type { PlayedTrack } from "./gameStore";
import { DEFAULT_REWARD_MODE } from "./rewards";
import type { GamePlayer, GameRules } from "./types";

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const count = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function readPlayer(value: unknown, index: number): GamePlayer | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const fields = value as Record<string, unknown>;
  const id = text(fields.id);

  return id === ""
    ? null
    : {
        id,
        name: text(fields.name, `#${index + 1}`),
        keyCode: text(fields.keyCode),
        colour: text(fields.colour, "#888888"),
      };
}

function readRules(value: unknown): GameRules {
  const fields = (value ?? {}) as Record<string, unknown>;

  return {
    roundDurationMs: count(fields.roundDurationMs, 30_000),
    answerDurationMs: count(fields.answerDurationMs, 10_000),
    targetMoney: count(fields.targetMoney, 1000),
    mode: (text(fields.mode) || DEFAULT_REWARD_MODE) as GameRules["mode"],
    tieThresholdMs: typeof fields.tieThresholdMs === "number" ? fields.tieThresholdMs : null,
    lyricsOnly: (fields.lyricsOnly ?? null) as GameRules["lyricsOnly"],
    extraTime: fields.extraTime === true,
    titles: fields.titles === true,
  };
}

/**
 * The line-up and rules a stored game was played with, or null when what came
 * back is not one.
 */
export function readOrigin(value: unknown): GameOrigin | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  const fields = value as Record<string, unknown>;
  const players = Array.isArray(fields.players)
    ? fields.players.map(readPlayer).filter((player): player is GamePlayer => player !== null)
    : [];

  if (players.length === 0) {
    return null;
  }

  return {
    players,
    rules: readRules(fields.rules),
    playedIds: Array.isArray(fields.playedIds)
      ? fields.playedIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/**
 * The songs a game played, as the pool a replay can look them up in.
 *
 * Only the title and the artist were kept, so the rest is filled in with
 * nothing: a history names songs, it does not play them.
 */
export function readTracks(tracks: unknown, catalogue: unknown): readonly PooledTrack[] {
  const source = Array.isArray(tracks) && tracks.length > 0 ? tracks : catalogue;

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((value: unknown): PooledTrack | null => {
      if (value === null || typeof value !== "object") {
        return null;
      }

      const fields = value as Record<string, unknown> & Partial<PlayedTrack>;
      const id = text(fields.id);

      return id === ""
        ? null
        : {
            id,
            uri: text(fields.uri),
            name: text(fields.name, id),
            artists: text(fields.artists),
            durationMs: count(fields.durationMs, 0),
            albumName: text(fields.albumName),
            albumImageUrl: typeof fields.albumImageUrl === "string" ? fields.albumImageUrl : null,
            playlistNames: [],
            playlistIds: [],
          };
    })
    .filter((track): track is PooledTrack => track !== null);
}

/**
 * The full track list a game was played against, when the backend still holds
 * one — the only thing that makes a game continuable somewhere else.
 *
 * Stricter than `readTracks`: this one has to be playable, so a track with no
 * address or no length is not one.
 */
export function readCatalogue(value: unknown): readonly PooledTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry: unknown): PooledTrack | null => {
      if (entry === null || typeof entry !== "object") {
        return null;
      }

      const fields = entry as Record<string, unknown>;
      const id = text(fields.id);
      const uri = text(fields.uri);
      const durationMs = count(fields.durationMs, 0);

      return id === "" || uri === "" || durationMs <= 0
        ? null
        : {
            id,
            uri,
            name: text(fields.name, id),
            artists: text(fields.artists),
            durationMs,
            albumName: text(fields.albumName),
            albumImageUrl: typeof fields.albumImageUrl === "string" ? fields.albumImageUrl : null,
            playlistNames: Array.isArray(fields.playlistNames)
              ? fields.playlistNames.filter((name): name is string => typeof name === "string")
              : [],
            playlistIds: Array.isArray(fields.playlistIds)
              ? fields.playlistIds.filter(
                  (playlistId): playlistId is string => typeof playlistId === "string",
                )
              : [],
          };
    })
    .filter((track): track is PooledTrack => track !== null);
}

/** The events of a stored game, in order, dropping anything unreadable. */
export function readEvents(events: readonly { seq: number; at: number; action: unknown }[]) {
  return events
    .filter(
      (event): event is LoggedEvent =>
        event.action !== null &&
        typeof event.action === "object" &&
        typeof (event.action as LoggedAction).type === "string",
    )
    .toSorted((first, second) => first.seq - second.seq);
}
