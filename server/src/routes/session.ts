// Signing in, and what the client needs to know about itself.

import { Hono } from "hono";

import type { Account, SessionResponse } from "@jtm-s/shared";

import { identify, mintSession } from "../auth";
import { listAccounts, listUniversesFor, touchAccount } from "../db";
import type { AppEnv } from "../env";
import { body, refuse, text } from "../guards";

export const session = new Hono<AppEnv>();

/**
 * A Spotify token in, a session of ours back.
 *
 * The Spotify token is spent once, here, and never stored: what it buys is the
 * account id, and from then on the client carries our own token instead.
 *
 * Worth being clear about what this does *not* check. Spotify will say whose
 * token it is, and nothing more — there is no way to ask which application it
 * was issued to. So this lets in anybody holding any valid Spotify token who
 * knows the address, which is on purpose: every account that can sign in may
 * play and may make universes. What keeps that from costing anything is the
 * address not being published, CORS, and the one limit on how many universes
 * an account may make.
 */
session.post("/session", async (context) => {
  const fields = await body(context);
  const spotifyToken = text(fields.spotifyToken, "spotifyToken", 4096, false);
  const account = await identify(spotifyToken);

  if (!account) {
    refuse(401, "Spotify would not say who that is");
  }

  const now = Date.now();

  await touchAccount(context.env.DB, account, now);

  const { token, expiresAt } = await mintSession(context.env.SESSION_SECRET, account, now);

  return context.json<SessionResponse>({ token, expiresAt, account });
});

/**
 * Who the caller is, and what they can reach.
 *
 * Also the moment the directory of who has signed in is brought up to date.
 * A session lasts a month and carries the identity itself, so it can outlive
 * the row that names it — the database may have been reset, or the row removed
 * — and everything that points at an account would then have nothing to point
 * at. Writing it back here costs one row per visit and makes that repair
 * itself.
 */
session.get("/me", async (context) => {
  const account = context.get("account");

  await touchAccount(context.env.DB, account, Date.now());

  return context.json({
    account,
    universes: await listUniversesFor(context.env.DB, account.id),
  });
});

/**
 * Everyone who has ever signed in — the list a universe's members are picked
 * from, since there are no invitations to accept.
 *
 * Only for somebody who is already in a universe: this list is needed to add
 * people to one, and whoever is in none has nobody to add. A stranger who
 * signs in has no business reading who plays here.
 */
session.get("/accounts", async (context) => {
  const account = context.get("account");
  const universes = await listUniversesFor(context.env.DB, account.id);

  if (universes.length === 0) {
    refuse(403, "only somebody in a universe can see who plays here");
  }

  const accounts: readonly Account[] = await listAccounts(context.env.DB);

  return context.json({ accounts });
});
