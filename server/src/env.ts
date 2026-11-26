// What the Worker is given by its environment.

import type { Account } from "@jtm-s/shared";

export type Env = {
  DB: D1Database;
  /**
   * The key our own session tokens are signed with.
   *
   * A secret, set with `wrangler secret put SESSION_SECRET`, never in a file.
   * Changing it signs everybody out, which is also how to sign everybody out.
   */
  SESSION_SECRET: string;
  /** Origins allowed to call this, comma separated. */
  ALLOWED_ORIGINS?: string;
};

/** What the routes behind the session middleware can count on. */
export type Variables = { account: Account };

export type AppEnv = { Bindings: Env; Variables: Variables };
