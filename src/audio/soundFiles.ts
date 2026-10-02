// The sound files present in the project, by their own names.
//
// Discovered from the folder, so adding a file is all it takes — the names in
// `SOUND_CHOICES` are matched against these. Vite fingerprints each file, so a
// replaced sound can never be served from a stale cache.

const files = import.meta.glob<string>("../assets/sounds/*", {
  eager: true,
  query: "?url",
  import: "default",
});

const byName = new Map<string, string>();

for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop();

  if (name) {
    byName.set(name.toLowerCase(), url);
  }
}

/** Where a named file lives, or null when the folder has no such file. */
export function fileUrl(name: string): string | null {
  return byName.get(name.toLowerCase()) ?? null;
}

/** Every file in the folder, for listing what is there but unused. */
export function availableFiles(): readonly string[] {
  return [...byName.keys()].sort();
}
