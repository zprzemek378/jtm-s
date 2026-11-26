// What the client and the backend agree on.
//
// Deliberately thin. The backend never interprets a game: the rules, the
// actions and the track list travel as opaque JSON and come back unchanged,
// which is what lets the game change shape without a migration and keeps the
// server a durable store rather than a second implementation of the rules.

/** A Spotify account id — who somebody is, everywhere here. */
export type AccountId = string;

export type Account = {
  id: AccountId;
  /** Their Spotify display name, for picking them out of a list. */
  displayName: string;
};

export type UniverseId = string;

/**
 * A shared pool of games: who plays in it, what has been played, and what is
 * still unfinished.
 */
export type Universe = {
  id: UniverseId;
  name: string;
  /**
   * The account that made it. Everyone has equal rights except for deleting
   * history, removing members and renaming or deleting the universe, and the
   * owner can only leave by handing it to somebody else.
   */
  ownerId: AccountId;
  createdAt: number;
};

export type UniverseMember = {
  account: Account;
  joinedAt: number;
};

/**
 * A player of a universe, rather than of one evening.
 *
 * Identified by a number inside the universe and never by name, so renaming
 * somebody keeps every game they ever played. Deleting deactivates, because
 * the history still needs the name.
 */
export type UniversePlayer = {
  universeId: UniverseId;
  /** Sequential within the universe, and never reused. */
  number: number;
  name: string;
  /** `#rrggbb`. */
  colour: string;
  active: boolean;
};

/** A game as the backend holds it: when, by whom, and the state of play. */
export type GameRecord = {
  id: string;
  /** Null for a game played outside any universe. */
  universeId: UniverseId | null;
  /** The account whose machine was hosting. */
  hostId: AccountId;
  /** The playlist selection, so a series keeps its no-repeats history. */
  historyKey: string;
  startedAt: number;
  /** When it was won or given up on; null while it is still a game. */
  closedAt: number | null;
  /** The line-up, rules and the history it opened on — the client's shape. */
  origin: unknown;
  /** The highest event number the backend holds for it. */
  upTo: number;
};

/** One thing that happened in a game, as it travels. */
export type SyncedEvent = {
  /**
   * Numbered by the client from one.
   *
   * The client numbering is what makes a retry free: the backend stores by
   * (game, seq), so sending the same event twice is sending it once.
   */
  seq: number;
  /** The client's own clock when it happened. */
  at: number;
  /** The game action, which only the client understands. */
  action: unknown;
};
