// The Worker.
//
// It keeps games and gets out of the way: every write may be made offline and
// sent later, and nothing here is needed to play. That is deliberate — the
// game is a party game at somebody's house, and an evening must not depend on
// a free tier staying up.

import { Hono } from "hono";
import { cors } from "hono/cors";

import { bearer, readSession } from "./auth";
import type { AppEnv } from "./env";
import { listSetting } from "./settings";
import { games } from "./routes/games";
import { session } from "./routes/session";
import { universes } from "./routes/universes";

const app = new Hono<AppEnv>();

app.use("*", async (context, next) =>
  cors({
    // Only the app itself, which is a setting rather than a guess: the client
    // is served from GitHub Pages in production and from the loopback address
    // in development.
    origin: (requested) => {
      const allowed = listSetting(context.env.ALLOWED_ORIGINS);

      return allowed.includes(requested) ? requested : null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 86_400,
  })(context, next),
);

/** Everything but signing in needs a session of ours. */
app.use("*", async (context, next) => {
  if (context.req.path === "/session" || context.req.method === "OPTIONS") {
    return next();
  }

  const account = await readSession(
    context.env.SESSION_SECRET,
    bearer(context.req.header("Authorization") ?? null),
    Date.now(),
  );

  if (!account) {
    return context.json({ error: "sign in again" }, 401);
  }

  context.set("account", account);

  return next();
});

app.route("/", session);
app.route("/universes", universes);
app.route("/games", games);

app.get("/", (context) => context.json({ service: "jtm-s", ok: true }));

app.notFound((context) => context.json({ error: "no such endpoint" }, 404));

app.onError((failure, context) => {
  // A refusal already carries its own answer; anything else is a fault here and
  // must not leak its details to the caller.
  if ("getResponse" in failure && typeof failure.getResponse === "function") {
    return failure.getResponse();
  }

  console.error(failure);

  return context.json({ error: "something went wrong here" }, 500);
});

export default app;
