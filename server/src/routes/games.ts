// Games: storing one, keeping its events, and reading them back.
//
// The backend never looks inside a game. The rules, the line-up and every
// action are the client's shapes, stored as the JSON they arrived as and handed
// back unchanged — so the game can grow new rules without a migration here, and
// what is kept is a record rather than a second implementation.

import { Hono, type Context } from "hono";

import { clockSkewMs, correctedAt, type GameDetail, type SyncEventsResponse } from "@jtm-s/shared";

import {
  appendEvents,
  getGame,
  isMember,
  listEvents,
  listGames,
  putGame,
  touchAccount,
} from "../db";
import type { AppEnv } from "../env";
import { body, nullableNumber, number, refuse, text, universeFor } from "../guards";

/** How many games a listing answers with. */
const PAGE = 100;

/**
 * The most events one call may carry.
 *
 * A game is a few dozen; a batch far larger than that is a client that has
 * gone wrong, and the batch is written in one statement.
 */
const MAX_BATCH = 500;

export const games = new Hono<AppEnv>();

/** Whether the caller may see this game at all. */
async function reachable(
  context: Context<AppEnv>,
  game: { hostId: string; universeId: string | null },
): Promise<boolean> {
  const account = context.get("account");

  if (game.hostId === account.id) {
    return true;
  }

  return game.universeId !== null && (await isMember(context.env.DB, game.universeId, account.id));
}

/**
 * The games of a universe, the ones this account played outside any, or —
 * with `?unfinished` — everything still unfinished that it can reach at all.
 */
games.get("/", async (context) => {
  const universeId = context.req.query("universeId");
  const account = context.get("account");

  if (universeId !== undefined) {
    await universeFor(context, universeId);

    return context.json({ games: await listGames(context.env.DB, { universeId }, PAGE) });
  }

  if (context.req.query("unfinished") !== undefined) {
    return context.json({
      games: await listGames(context.env.DB, { unfinishedFor: account.id }, PAGE),
    });
  }

  return context.json({ games: await listGames(context.env.DB, { hostId: account.id }, PAGE) });
});

/**
 * Opens a game, or brings the stored one up to date.
 *
 * The client chose the id, so this is one call for both and sending it again
 * costs nothing — which is what lets a client that has been offline simply
 * send everything it has.
 */
games.put("/:id", async (context) => {
  const id = context.req.param("id");
  const account = context.get("account");
  const fields = await body(context);
  const universeId =
    fields.universeId === null ? null : (text(fields.universeId, "universeId", 128, true) ?? null);

  if (universeId !== null) {
    await universeFor(context, universeId);
  }

  const stored = await getGame(context.env.DB, id);

  if (stored && !(await reachable(context, stored.game))) {
    refuse(404, "no such game");
  }

  // A game names the account that hosted it, and a session can outlive the row
  // that names that account.
  await touchAccount(context.env.DB, account, Date.now());
  await putGame(
    context.env.DB,
    {
      id,
      universeId,
      // Settled by whoever stored it first: a member who syncs somebody else's
      // game does not become its host.
      hostId: stored?.game.hostId ?? account.id,
      historyKey: text(fields.historyKey, "historyKey", 512, true) ?? "",
      startedAt: stored?.game.startedAt ?? number(fields.startedAt, "startedAt"),
      closedAt: nullableNumber(fields.closedAt, "closedAt"),
      origin: fields.origin ?? null,
      catalogue: fields.catalogue ?? null,
      tracks: fields.tracks ?? null,
      upTo: fields.upTo === undefined ? null : number(fields.upTo, "upTo"),
    },
    Date.now(),
  );

  return context.json({ ok: true });
});

/**
 * Stores a batch of events.
 *
 * The client numbers them, so this is safe to call twice with the same batch —
 * which it will be, by a client that lost the reply. The answer says how far
 * the game now goes, and that is what the client marks as sent.
 *
 * The batch also carries the client's own clock. An evening can be played on a
 * machine whose clock is days out and only sync afterwards: its timestamps
 * agree with each other, so one offset measured here puts the whole batch in
 * the right place in the history.
 */
games.post("/:id/events", async (context) => {
  const id = context.req.param("id");
  const stored = await getGame(context.env.DB, id);

  if (!stored || !(await reachable(context, stored.game))) {
    refuse(404, "no such game");
  }

  const fields = await body(context);
  const serverNow = Date.now();
  const skew = clockSkewMs(number(fields.clientNow, "clientNow"), serverNow);
  const incoming: unknown = fields.events;

  if (!Array.isArray(incoming)) {
    refuse(400, "events have to be a list");
  }

  if (incoming.length > MAX_BATCH) {
    refuse(413, "too many events in one batch");
  }

  const events = incoming.map((event: unknown, index) => {
    if (event === null || typeof event !== "object") {
      refuse(400, `event ${index} is not an object`);
    }

    const { seq, at, action } = event as Record<string, unknown>;

    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) {
      refuse(400, `event ${index} has no sequence number`);
    }

    return { seq, at: number(at, `event ${index} time`), serverAt: 0, action: action ?? null };
  });

  const confirmedUpTo = await appendEvents(
    context.env.DB,
    id,
    events.map((event) => ({ ...event, serverAt: correctedAt(event.at, skew) })),
  );

  return context.json<SyncEventsResponse>({ confirmedUpTo, serverNow });
});

/** Everything about one game: enough to replay it, or to carry it on. */
games.get("/:id", async (context) => {
  const id = context.req.param("id");
  const stored = await getGame(context.env.DB, id);

  if (!stored || !(await reachable(context, stored.game))) {
    refuse(404, "no such game");
  }

  return context.json<GameDetail>({
    game: stored.game,
    events: await listEvents(context.env.DB, id),
    catalogue: stored.catalogue,
    tracks: stored.tracks,
  });
});

/** Deleting history, which belongs to whoever owns the universe. */
games.delete("/:id", async (context) => {
  const id = context.req.param("id");
  const stored = await getGame(context.env.DB, id);

  if (!stored) {
    refuse(404, "no such game");
  }

  if (stored.game.universeId === null) {
    const account = context.get("account");

    if (stored.game.hostId !== account.id) {
      refuse(404, "no such game");
    }
  } else {
    await universeFor(context, stored.game.universeId, "owner");
  }

  await context.env.DB.batch([
    context.env.DB.prepare(`DELETE FROM events WHERE game_id = ?`).bind(id),
    context.env.DB.prepare(`DELETE FROM games WHERE id = ?`).bind(id),
  ]);

  return context.json({ ok: true });
});
