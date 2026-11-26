// Signing in, and what the client needs to know about itself.

import { Hono } from "hono";

import type { Account, SessionResponse } from "@jtm-s/shared";

import { identify, mintSession } from "../auth";
import { listAccounts, listUniversesFor, touchAccount } from "../db";
import type { AppEnv } from "../env";
import { mayCreateUniverse } from "../settings";
import { body, refuse, text } from "../guards";

export const session = new Hono<AppEnv>();

/**
 * A Spotify token in, a session of ours back.
 *
 * The Spotify token is spent once, here, and never stored: what it buys is the
 * account id, and from then on the client carries our own token instead.
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

  return context.json<SessionResponse>({
    token,
    expiresAt,
    account,
    mayCreateUniverse: mayCreateUniverse(context.env, account.id),
  });
});

/** Who the caller is, and what they can reach. */
session.get("/me", async (context) => {
  const account = context.get("account");

  return context.json({
    account,
    mayCreateUniverse: mayCreateUniverse(context.env, account.id),
    universes: await listUniversesFor(context.env.DB, account.id),
  });
});

/**
 * Everyone who has ever signed in — the list a universe's members are picked
 * from, since there are no invitations to accept.
 *
 * Only for somebody who is already in a universe or can start one: a stranger
 * who signs in has no business reading a list of the people who play here.
 */
session.get("/accounts", async (context) => {
  const account = context.get("account");
  const universes = await listUniversesFor(context.env.DB, account.id);

  if (universes.length === 0 && !mayCreateUniverse(context.env, account.id)) {
    refuse(403, "only somebody in a universe can see who plays here");
  }

  const accounts: readonly Account[] = await listAccounts(context.env.DB);

  return context.json({ accounts });
});
