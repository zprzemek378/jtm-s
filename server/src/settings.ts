// The settings the Worker is configured with, and the questions they answer.
//
// Separate from the bindings so that these rules can be checked anywhere: the
// bindings are types the Workers runtime brings, while this is a string and a
// decision made from it.

/** Splits one of the comma-separated settings, ignoring the spaces around it. */
export function listSetting(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Whether this account may create a universe at all.
 *
 * Anybody can be *added* to one; only the accounts named in the setting can
 * start one, which is the only thing standing between a public URL and
 * strangers filling the free tier. Unset means nobody, which is how it starts.
 */
export function mayCreateUniverse(
  settings: { UNIVERSE_CREATORS?: string },
  accountId: string,
): boolean {
  return listSetting(settings.UNIVERSE_CREATORS).includes(accountId);
}
