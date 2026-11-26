// Every query, in one place.
//
// The rows are turned into the shapes the client knows here and nowhere else,
// so the routes read as the thing they do rather than as SQL. The columns the
// backend never looks inside — a game's rules, its line-up, the actions — go in
// and come out as the JSON text they arrived as.

import type {
  Account,
  GameRecord,
  SyncedEvent,
  Universe,
  UniverseMember,
  UniversePlayer,
} from "@jtm-s/shared";

type AccountRow = { id: string; display_name: string };
type UniverseRow = { id: string; name: string; owner_id: string; created_at: number };
type MemberRow = AccountRow & { joined_at: number };
type PlayerRow = {
  universe_id: string;
  number: number;
  name: string;
  colour: string;
  active: number;
};
type GameRow = {
  id: string;
  universe_id: string | null;
  host_id: string;
  history_key: string;
  started_at: number;
  closed_at: number | null;
  origin: string;
  up_to: number | null;
};
type EventRow = { seq: number; at: number; action: string };

const toAccount = (row: AccountRow): Account => ({ id: row.id, displayName: row.display_name });

const toUniverse = (row: UniverseRow): Universe => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  createdAt: row.created_at,
});

const toPlayer = (row: PlayerRow): UniversePlayer => ({
  universeId: row.universe_id,
  number: row.number,
  name: row.name,
  colour: row.colour,
  active: row.active === 1,
});

/** JSON as it was stored, or null for a column that holds nothing. */
function parse(text: string | null): unknown {
  if (text === null) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Something stored by hand, or a write that was cut short. Nothing can be
    // done with it, and refusing the whole game over it would be worse.
    return null;
  }
}

const toGame = (row: GameRow): GameRecord => ({
  id: row.id,
  universeId: row.universe_id,
  hostId: row.host_id,
  historyKey: row.history_key,
  startedAt: row.started_at,
  closedAt: row.closed_at,
  origin: parse(row.origin),
  upTo: row.up_to ?? 0,
});

/** The games query, with the event count the client needs alongside it. */
const GAME_COLUMNS = `games.id, games.universe_id, games.host_id, games.history_key,
  games.started_at, games.closed_at, games.origin,
  (SELECT MAX(seq) FROM events WHERE events.game_id = games.id) AS up_to`;

/** Notes that this account exists and has just been seen. */
export async function touchAccount(db: D1Database, account: Account, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO accounts (id, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = ?`,
    )
    .bind(account.id, account.displayName, now, now, now)
    .run();
}

/**
 * Everyone who has ever signed in.
 *
 * This is the list a universe's members are picked from: there are no
 * invitations to accept, so somebody has to have been here at least once.
 */
export async function listAccounts(db: D1Database): Promise<readonly Account[]> {
  const { results } = await db
    .prepare(`SELECT id, display_name FROM accounts ORDER BY display_name COLLATE NOCASE`)
    .all<AccountRow>();

  return results.map(toAccount);
}

export async function createUniverse(db: D1Database, universe: Universe): Promise<void> {
  await db.batch([
    db
      .prepare(`INSERT INTO universes (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)`)
      .bind(universe.id, universe.name, universe.ownerId, universe.createdAt),
    // The owner is a member like everybody else; the ownership is the only
    // thing that sets them apart.
    db
      .prepare(`INSERT INTO members (universe_id, account_id, joined_at) VALUES (?, ?, ?)`)
      .bind(universe.id, universe.ownerId, universe.createdAt),
  ]);
}

export async function getUniverse(db: D1Database, id: string): Promise<Universe | null> {
  const row = await db
    .prepare(`SELECT id, name, owner_id, created_at FROM universes WHERE id = ?`)
    .bind(id)
    .first<UniverseRow>();

  return row ? toUniverse(row) : null;
}

/** The universes this account belongs to, newest first. */
export async function listUniversesFor(
  db: D1Database,
  accountId: string,
): Promise<readonly Universe[]> {
  const { results } = await db
    .prepare(
      `SELECT universes.id, universes.name, universes.owner_id, universes.created_at
       FROM universes
       JOIN members ON members.universe_id = universes.id
       WHERE members.account_id = ?
       ORDER BY universes.created_at DESC`,
    )
    .bind(accountId)
    .all<UniverseRow>();

  return results.map(toUniverse);
}

export async function isMember(
  db: D1Database,
  universeId: string,
  accountId: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS present FROM members WHERE universe_id = ? AND account_id = ?`)
    .bind(universeId, accountId)
    .first<{ present: number }>();

  return row !== null;
}

export async function listMembers(
  db: D1Database,
  universeId: string,
): Promise<readonly UniverseMember[]> {
  const { results } = await db
    .prepare(
      `SELECT accounts.id, accounts.display_name, members.joined_at
       FROM members
       JOIN accounts ON accounts.id = members.account_id
       WHERE members.universe_id = ?
       ORDER BY members.joined_at`,
    )
    .bind(universeId)
    .all<MemberRow>();

  return results.map((row) => ({ account: toAccount(row), joinedAt: row.joined_at }));
}

export async function addMember(
  db: D1Database,
  universeId: string,
  accountId: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO members (universe_id, account_id, joined_at) VALUES (?, ?, ?)
       ON CONFLICT (universe_id, account_id) DO NOTHING`,
    )
    .bind(universeId, accountId, now)
    .run();
}

export async function removeMember(
  db: D1Database,
  universeId: string,
  accountId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM members WHERE universe_id = ? AND account_id = ?`)
    .bind(universeId, accountId)
    .run();
}

/** Hands the universe over, which is the only way an owner can leave. */
export async function setOwner(
  db: D1Database,
  universeId: string,
  accountId: string,
): Promise<void> {
  await db
    .prepare(`UPDATE universes SET owner_id = ? WHERE id = ?`)
    .bind(accountId, universeId)
    .run();
}

export async function renameUniverse(
  db: D1Database,
  universeId: string,
  name: string,
): Promise<void> {
  await db.prepare(`UPDATE universes SET name = ? WHERE id = ?`).bind(name, universeId).run();
}

export async function deleteUniverse(db: D1Database, universeId: string): Promise<void> {
  // The rows that hang off it go with it, which is what the foreign keys say —
  // but D1 only enforces them when asked, so the deletes are written out.
  await db.batch([
    db
      .prepare(`DELETE FROM events WHERE game_id IN (SELECT id FROM games WHERE universe_id = ?)`)
      .bind(universeId),
    db.prepare(`DELETE FROM games WHERE universe_id = ?`).bind(universeId),
    db.prepare(`DELETE FROM players WHERE universe_id = ?`).bind(universeId),
    db.prepare(`DELETE FROM members WHERE universe_id = ?`).bind(universeId),
    db.prepare(`DELETE FROM universes WHERE id = ?`).bind(universeId),
  ]);
}

export async function listPlayers(
  db: D1Database,
  universeId: string,
): Promise<readonly UniversePlayer[]> {
  const { results } = await db
    .prepare(
      `SELECT universe_id, number, name, colour, active FROM players
       WHERE universe_id = ? ORDER BY number`,
    )
    .bind(universeId)
    .all<PlayerRow>();

  return results.map(toPlayer);
}

/**
 * Adds a player and answers with the number they were given.
 *
 * Numbers are never reused, even after a deletion: every game that has ever
 * been played refers to them.
 */
export async function createPlayer(
  db: D1Database,
  universeId: string,
  player: { name: string; colour: string },
  now: number,
): Promise<UniversePlayer> {
  const row = await db
    .prepare(
      `INSERT INTO players (universe_id, number, name, colour, active, created_at)
       VALUES (
         ?,
         (SELECT COALESCE(MAX(number), 0) + 1 FROM players WHERE universe_id = ?),
         ?, ?, 1, ?
       )
       RETURNING universe_id, number, name, colour, active`,
    )
    .bind(universeId, universeId, player.name, player.colour, now)
    .first<PlayerRow>();

  if (!row) {
    throw new Error("the player was not stored");
  }

  return toPlayer(row);
}

export async function updatePlayer(
  db: D1Database,
  universeId: string,
  number: number,
  change: { name?: string; colour?: string; active?: boolean },
): Promise<UniversePlayer | null> {
  const row = await db
    .prepare(
      `UPDATE players SET
         name = COALESCE(?, name),
         colour = COALESCE(?, colour),
         active = COALESCE(?, active)
       WHERE universe_id = ? AND number = ?
       RETURNING universe_id, number, name, colour, active`,
    )
    .bind(
      change.name ?? null,
      change.colour ?? null,
      change.active === undefined ? null : Number(change.active),
      universeId,
      number,
    )
    .first<PlayerRow>();

  return row ? toPlayer(row) : null;
}

/**
 * Stores a game, or brings the stored one up to date.
 *
 * The client chose the id, so this is the same call whether the game is new or
 * known — and sending it again is free. Who was hosting and when it started are
 * settled by whoever got there first; everything else is the latest word.
 */
export async function putGame(
  db: D1Database,
  game: {
    id: string;
    universeId: string | null;
    hostId: string;
    historyKey: string;
    startedAt: number;
    closedAt: number | null;
    origin: unknown;
    catalogue: unknown;
    tracks: unknown;
    /** The last event the client holds; anything above it has been taken back. */
    upTo: number | null;
  },
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO games
         (id, universe_id, host_id, history_key, started_at, closed_at, origin,
          catalogue, tracks, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         closed_at = excluded.closed_at,
         origin = excluded.origin,
         -- A game that has ended has no use for its track list, and it is by
         -- far the largest thing stored here. Short of that the list is kept:
         -- a client that no longer carries one — it gave the list up to fit in
         -- its own store — must not take away the copy that lets the game be
         -- picked up on another machine.
         catalogue = CASE
           WHEN excluded.closed_at IS NOT NULL THEN NULL
           ELSE COALESCE(excluded.catalogue, games.catalogue)
         END,
         -- The titles that were played are kept, and never thrown away by a
         -- later write that happens not to carry them.
         tracks = COALESCE(excluded.tracks, games.tracks),
         updated_at = excluded.updated_at`,
    )
    .bind(
      game.id,
      game.universeId,
      game.hostId,
      game.historyKey,
      game.startedAt,
      game.closedAt,
      JSON.stringify(game.origin ?? null),
      game.catalogue === undefined || game.catalogue === null
        ? null
        : JSON.stringify(game.catalogue),
      game.tracks === undefined || game.tracks === null ? null : JSON.stringify(game.tracks),
      now,
    )
    .run();

  // A move taken back on the client cuts its log short, and the client's log is
  // the truth about its own game: whatever is stored above that number was
  // undone and has no business being read back as history.
  if (game.upTo !== null) {
    await db
      .prepare(`DELETE FROM events WHERE game_id = ? AND seq > ?`)
      .bind(game.id, game.upTo)
      .run();
  }
}

export async function getGame(
  db: D1Database,
  id: string,
): Promise<{ game: GameRecord; catalogue: unknown; tracks: unknown } | null> {
  const row = await db
    .prepare(`SELECT ${GAME_COLUMNS}, games.catalogue, games.tracks FROM games WHERE games.id = ?`)
    .bind(id)
    .first<GameRow & { catalogue: string | null; tracks: string | null }>();

  return row
    ? { game: toGame(row), catalogue: parse(row.catalogue), tracks: parse(row.tracks) }
    : null;
}

/** The games of a universe, or the ones an account played outside any. */
export async function listGames(
  db: D1Database,
  scope: { universeId: string } | { hostId: string },
  limit: number,
): Promise<readonly GameRecord[]> {
  const { results } =
    "universeId" in scope
      ? await db
          .prepare(
            `SELECT ${GAME_COLUMNS} FROM games WHERE games.universe_id = ?
             ORDER BY games.started_at DESC LIMIT ?`,
          )
          .bind(scope.universeId, limit)
          .all<GameRow>()
      : await db
          .prepare(
            `SELECT ${GAME_COLUMNS} FROM games
             WHERE games.host_id = ? AND games.universe_id IS NULL
             ORDER BY games.started_at DESC LIMIT ?`,
          )
          .bind(scope.hostId, limit)
          .all<GameRow>();

  return results.map(toGame);
}

/**
 * Stores a batch of events and answers with how far the game now goes.
 *
 * Each event is stored by (game, seq), so a batch that arrives twice — a lost
 * reply, a client that gave up waiting — leaves exactly what one copy would.
 */
export async function appendEvents(
  db: D1Database,
  gameId: string,
  events: readonly { seq: number; at: number; serverAt: number; action: unknown }[],
): Promise<number> {
  if (events.length > 0) {
    const insert = db.prepare(
      `INSERT INTO events (game_id, seq, at, server_at, action) VALUES (?, ?, ?, ?, ?)
       -- A batch sent twice is the same batch, so the correction measured when
       -- it first arrived is kept: an event already stored must not drift by a
       -- few milliseconds every time a client retries.
       ON CONFLICT (game_id, seq) DO UPDATE SET
         at = excluded.at, action = excluded.action`,
    );

    await db.batch(
      events.map((event) =>
        insert.bind(gameId, event.seq, event.at, event.serverAt, JSON.stringify(event.action)),
      ),
    );
  }

  const row = await db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS up_to FROM events WHERE game_id = ?`)
    .bind(gameId)
    .first<{ up_to: number }>();

  return row?.up_to ?? 0;
}

export async function listEvents(db: D1Database, gameId: string): Promise<readonly SyncedEvent[]> {
  const { results } = await db
    .prepare(`SELECT seq, at, action FROM events WHERE game_id = ? ORDER BY seq`)
    .bind(gameId)
    .all<EventRow>();

  return results.map((row) => ({ seq: row.seq, at: row.at, action: parse(row.action) }));
}
