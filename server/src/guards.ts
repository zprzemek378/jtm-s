// The checks every route makes before it does anything, and the shape of a
// refusal. Written out as functions so a route reads as what it allows.

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { getUniverse, isMember } from "./db";
import type { AppEnv, Env } from "./env";
import { mayCreateUniverse } from "./settings";

/** Refuses the request outright, with a line the client can show. */
export function refuse(status: 400 | 401 | 403 | 404 | 409 | 413, message: string): never {
  throw new HTTPException(status, {
    res: Response.json({ error: message }, { status }),
  });
}

/** The universe, or a refusal that does not say whether it exists. */
export async function universeFor(
  context: Context<AppEnv>,
  universeId: string,
  need: "member" | "owner" = "member",
) {
  const account = context.get("account");
  const universe = await getUniverse(context.env.DB, universeId);

  // Deliberately the same answer for "no such universe" and "not yours":
  // somebody who is not in it has no business learning that it exists.
  if (!universe || !(await isMember(context.env.DB, universeId, account.id))) {
    refuse(404, "no such universe");
  }

  if (need === "owner" && universe.ownerId !== account.id) {
    refuse(403, "only the owner can do that");
  }

  return universe;
}

export function requireCreator(env: Env, accountId: string): void {
  if (!mayCreateUniverse(env, accountId)) {
    refuse(403, "this account cannot create universes");
  }
}

/** The body as an object, or a refusal. */
export async function body(context: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await context.req.json();

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      refuse(400, "the body has to be an object");
    }

    return parsed as Record<string, unknown>;
  } catch (failure) {
    if (failure instanceof HTTPException) {
      throw failure;
    }

    refuse(400, "the body has to be JSON");
  }
}

/** A field that has to be a non-empty string of a sensible length. */
export function text(value: unknown, field: string, limit: number, optional: false): string;
export function text(
  value: unknown,
  field: string,
  limit: number,
  optional: true,
): string | undefined;
export function text(
  value: unknown,
  field: string,
  limit: number,
  optional: boolean,
): string | undefined {
  if (value === undefined && optional) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    refuse(400, `${field} has to be text`);
  }

  if (value.length > limit) {
    refuse(400, `${field} is too long`);
  }

  return value.trim();
}

/** A field that has to be a whole number of milliseconds, or any finite number. */
export function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    refuse(400, `${field} has to be a number`);
  }

  return value;
}

export function nullableNumber(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : number(value, field);
}

/** `#rrggbb`, which is the only colour this app ever stores. */
export function colour(value: unknown, optional = false): string | undefined {
  if (value === undefined && optional) {
    return undefined;
  }

  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    refuse(400, "a colour has to look like #rrggbb");
  }

  return value.toLowerCase();
}
