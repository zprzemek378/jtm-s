// Who is calling.
//
// Spotify is the only account anybody has here, so signing in means proving
// that: the client sends a Spotify access token, the Worker spends it once on
// asking Spotify whose it is, and then issues a session of its own. Every later
// call carries that instead — the alternative would be a call to Spotify in
// front of every request, which is both slow and a careless way to spend a rate
// limit everybody shares.
//
// The session token is signed, not encrypted: it says who somebody is and when
// it expires, and anyone can read it. What they cannot do is write one.

import type { Account } from "@jtm-s/shared";

/** How long a session lasts. Long enough for an evening, and then some. */
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_VERSION = "v1";

type Claims = {
  /** The Spotify account id. */
  sub: string;
  name: string;
  /** When it expires, in milliseconds. */
  exp: number;
};

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(text: string) {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // Built on a buffer of its own rather than with `Uint8Array.from`, because
  // what WebCrypto will take is an array over a plain `ArrayBuffer` and that
  // is the one `from` does not promise.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a session for this account. */
export async function mintSession(
  secret: string,
  account: Account,
  now: number,
): Promise<{ token: string; expiresAt: number }> {
  const claims: Claims = {
    sub: account.id,
    name: account.displayName,
    exp: now + SESSION_LIFETIME_MS,
  };
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload));

  return {
    token: `${TOKEN_VERSION}.${payload}.${base64url(new Uint8Array(signature))}`,
    expiresAt: claims.exp,
  };
}

/**
 * The account a token names, or null for one that is forged, damaged, from an
 * older format, or simply out of date.
 */
export async function readSession(
  secret: string,
  token: string | null,
  now: number,
): Promise<Account | null> {
  const [version, payload, signature] = (token ?? "").split(".");

  if (version !== TOKEN_VERSION || !payload || !signature) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    fromBase64url(signature),
    encoder.encode(payload),
  );

  if (!valid) {
    return null;
  }

  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as Claims;

    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= now) {
      return null;
    }

    return { id: claims.sub, displayName: typeof claims.name === "string" ? claims.name : "" };
  } catch {
    return null;
  }
}

/** The bearer token on a request, if it has one. */
export function bearer(header: string | null): string | null {
  const match = /^Bearer (.+)$/.exec(header ?? "");

  return match?.[1] ?? null;
}

/**
 * Asks Spotify whose token this is.
 *
 * Answers null when Spotify refuses it, which is the only check worth making:
 * a token Spotify will not accept is not an identity.
 */
export async function identify(spotifyToken: string): Promise<Account | null> {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const profile = (await response.json()) as { id?: string; display_name?: string | null };

  if (typeof profile.id !== "string" || profile.id.length === 0) {
    return null;
  }

  return { id: profile.id, displayName: profile.display_name ?? profile.id };
}
