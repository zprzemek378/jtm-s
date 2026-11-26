// The settings the Worker is configured with, read as the lists they are.
//
// Separate from the bindings so that this can be checked anywhere: the
// bindings are types the Workers runtime brings, while this is a string.

/** Splits one of the comma-separated settings, ignoring the spaces around it. */
export function listSetting(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
