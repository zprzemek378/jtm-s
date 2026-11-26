// Universes: the shared pool of games, who is in it, and who plays in it.
//
// Everyone in a universe has the same rights, with four exceptions that belong
// to whoever made it: removing somebody else, deleting history, renaming it and
// deleting it. An owner cannot simply leave either — they hand it over first,
// so a universe is never left without one.

import { Hono } from "hono";

import type { UniverseDetail, UniversePlayer } from "@jtm-s/shared";

import {
  addMember,
  countUniversesOwnedBy,
  createPlayer,
  createUniverse,
  deleteUniverse,
  isMember,
  listGames,
  listMembers,
  listPlayers,
  removeMember,
  renameUniverse,
  setOwner,
  updatePlayer,
} from "../db";
import type { AppEnv } from "../env";
import { body, colour, refuse, text, universeFor } from "../guards";

/** How many games a universe's page asks for at once. */
const GAME_PAGE = 100;

/**
 * How many universes one account may make.
 *
 * Anybody who can sign in can make one — there is no list of who may. This is
 * the only limit, and it is not a rule about how the game is played: it is
 * what keeps a mistake, or somebody bored with a script, from filling a free
 * tier that everybody here shares. Nobody will ever reach it by playing.
 */
const MAX_UNIVERSES_PER_ACCOUNT = 20;

export const universes = new Hono<AppEnv>();

universes.post("/", async (context) => {
  const account = context.get("account");

  if ((await countUniversesOwnedBy(context.env.DB, account.id)) >= MAX_UNIVERSES_PER_ACCOUNT) {
    refuse(409, "this account has made as many universes as it may");
  }

  const fields = await body(context);
  const universe = {
    id: crypto.randomUUID(),
    name: text(fields.name, "name", 80, false),
    ownerId: account.id,
    createdAt: Date.now(),
  };

  await createUniverse(context.env.DB, universe);

  return context.json({ universe }, 201);
});

universes.get("/:id", async (context) => {
  const id = context.req.param("id");
  const universe = await universeFor(context, id);
  const [members, players, games] = await Promise.all([
    listMembers(context.env.DB, id),
    listPlayers(context.env.DB, id),
    listGames(context.env.DB, { universeId: id }, GAME_PAGE),
  ]);

  return context.json<UniverseDetail>({ universe, members, players, games });
});

universes.patch("/:id", async (context) => {
  const id = context.req.param("id");

  await universeFor(context, id, "owner");

  const fields = await body(context);

  await renameUniverse(context.env.DB, id, text(fields.name, "name", 80, false));

  return context.json({ ok: true });
});

universes.delete("/:id", async (context) => {
  const id = context.req.param("id");

  await universeFor(context, id, "owner");
  await deleteUniverse(context.env.DB, id);

  return context.json({ ok: true });
});

/** Adding somebody is instant, and any member may do it. */
universes.post("/:id/members", async (context) => {
  const id = context.req.param("id");

  await universeFor(context, id);

  const fields = await body(context);
  const accountId = text(fields.accountId, "accountId", 128, false);
  const known = await context.env.DB.prepare(`SELECT 1 AS present FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ present: number }>();

  // There are no invitations, so somebody has to have signed in at least once
  // before they can be added — otherwise a typo would make a member nobody is.
  if (!known) {
    refuse(404, "that account has never signed in here");
  }

  await addMember(context.env.DB, id, accountId, Date.now());

  return context.json({ ok: true });
});

/** Leaving, or being removed — which only the owner can do to somebody else. */
universes.delete("/:id/members/:accountId", async (context) => {
  const id = context.req.param("id");
  const accountId = context.req.param("accountId");
  const account = context.get("account");
  const leaving = accountId === account.id;
  const universe = await universeFor(context, id, leaving ? "member" : "owner");

  if (universe.ownerId === accountId) {
    refuse(409, "the owner has to hand the universe over first");
  }

  await removeMember(context.env.DB, id, accountId);

  return context.json({ ok: true });
});

/** Handing it over: the last thing an owner does before leaving. */
universes.put("/:id/owner", async (context) => {
  const id = context.req.param("id");

  await universeFor(context, id, "owner");

  const fields = await body(context);
  const accountId = text(fields.accountId, "accountId", 128, false);

  if (!(await isMember(context.env.DB, id, accountId))) {
    refuse(404, "they are not in this universe");
  }

  await setOwner(context.env.DB, id, accountId);

  return context.json({ ok: true });
});

universes.post("/:id/players", async (context) => {
  const id = context.req.param("id");

  await universeFor(context, id);

  const fields = await body(context);
  const player = await createPlayer(
    context.env.DB,
    id,
    {
      name: text(fields.name, "name", 40, false),
      colour: colour(fields.colour) ?? "#000000",
    },
    Date.now(),
  );

  return context.json<{ player: UniversePlayer }>({ player }, 201);
});

/**
 * Renaming, recolouring, or putting somebody aside.
 *
 * Nothing is ever deleted here: a player who has stopped coming is deactivated,
 * because every game they played still names them.
 */
universes.patch("/:id/players/:number", async (context) => {
  const id = context.req.param("id");
  const number = Number(context.req.param("number"));

  await universeFor(context, id);

  if (!Number.isInteger(number)) {
    refuse(400, "a player is identified by a number");
  }

  const fields = await body(context);
  const player = await updatePlayer(context.env.DB, id, number, {
    name: text(fields.name, "name", 40, true),
    colour: colour(fields.colour, true),
    active: typeof fields.active === "boolean" ? fields.active : undefined,
  });

  if (!player) {
    refuse(404, "no such player");
  }

  return context.json<{ player: UniversePlayer }>({ player });
});
