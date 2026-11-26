// The shapes that go over the wire, and the one place the routes are named.
//
// Both sides import these, so a route that changes name cannot be half
// changed, and a response the client reads wrongly will not compile.

import type {
  Account,
  AccountId,
  GameRecord,
  SyncedEvent,
  Universe,
  UniverseMember,
  UniversePlayer,
} from "./types";

/** Signing in: a Spotify token in, a session of our own back. */
export type SessionRequest = {
  /** A Spotify access token, used once to ask Spotify who this is. */
  spotifyToken: string;
};

export type SessionResponse = {
  /** The session token every later call carries. */
  token: string;
  /** When it stops being accepted. */
  expiresAt: number;
  account: Account;
};

export type UniverseDetail = {
  universe: Universe;
  members: readonly UniverseMember[];
  players: readonly UniversePlayer[];
  games: readonly GameRecord[];
};

export type CreateUniverseRequest = { name: string };
/** Renaming one — the only thing about a universe that can change. */
export type UpdateUniverseRequest = { name: string };
export type AddMemberRequest = { accountId: AccountId };
/** Handing a universe over, which is the only way an owner can leave it. */
export type SetOwnerRequest = { accountId: AccountId };
export type CreatePlayerRequest = { name: string; colour: string };
export type UpdatePlayerRequest = { name?: string; colour?: string; active?: boolean };

/** Opening or updating a game. The client chose the id, so this is idempotent. */
export type PutGameRequest = {
  universeId: string | null;
  historyKey: string;
  startedAt: number;
  closedAt: number | null;
  /** The line-up, rules and opening history, in the client's own shape. */
  origin: unknown;
  /**
   * The tracks it can draw from, for picking the game up on another machine.
   * Left out when the list is too large to be worth storing.
   */
  catalogue?: unknown;
  /**
   * The last event number this client holds.
   *
   * Anything the backend has above it is gone — taken back from the hidden
   * edit screen — and goes with this call. The client's log is the truth about
   * its own game.
   */
  upTo?: number;
  /**
   * The songs that were actually played, by title.
   *
   * Kept for ever, unlike the list above: it is a round or two of titles
   * rather than a whole playlist, and without it the history of a finished
   * game could name no songs at all.
   */
  tracks?: unknown;
};

export type SyncEventsRequest = {
  /** The client's clock as the batch left, for the skew correction. */
  clientNow: number;
  events: readonly SyncedEvent[];
};

export type SyncEventsResponse = {
  /** Everything up to here is now stored; the client can stop sending it. */
  confirmedUpTo: number;
  serverNow: number;
};

export type GameDetail = {
  game: GameRecord;
  events: readonly SyncedEvent[];
  /** The track list, when the backend was given one. */
  catalogue: unknown;
  /** The songs that were played, by title. */
  tracks: unknown;
};

/** Every route, named once. */
export const API = {
  session: "/session",
  me: "/me",
  accounts: "/accounts",
  universes: "/universes",
  universe: (id: string) => `/universes/${id}`,
  members: (id: string) => `/universes/${id}/members`,
  member: (id: string, accountId: string) => `/universes/${id}/members/${accountId}`,
  owner: (id: string) => `/universes/${id}/owner`,
  players: (id: string) => `/universes/${id}/players`,
  player: (id: string, number: number) => `/universes/${id}/players/${number}`,
  games: "/games",
  game: (id: string) => `/games/${id}`,
  gameEvents: (id: string) => `/games/${id}/events`,
} as const;

/** What a refusal looks like, whatever refused. */
export type ApiError = { error: string };
