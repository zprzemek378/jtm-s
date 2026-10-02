/*
 * Playlist scan probe — paste into the browser console on the running app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Since the February 2026 Web API changes, `GET /playlists/{id}/items` only
 * answers for playlists the account owns or collaborates on; everything else
 * returns 403, and Spotify's own editorial playlists return 404 as if they did
 * not exist. Playback is not restricted the same way: `PUT /me/player/play`
 * with a `context_uri` starts ANY playlist, `GET /me/player/queue` then reports
 * the current track plus the next 20 with full metadata, and
 * `offset: {position: N}` jumps straight to an index in the context.
 *
 * So a playlist we may not read can still be enumerated by playing it silently
 * and reading the queue — 21 tracks per jump, 2 requests per jump.
 *
 * WHAT THIS SCRIPT PROVES (or disproves)
 * --------------------------------------
 * 1. BRAKUJE: 0   — the scan loses nothing. Validated against a playlist the
 *                   account owns, where `/items` gives the ground truth.
 * 2. NADMIAROWE: 0 — the scan invents nothing. Without `repeat=context`,
 *                   Spotify's autoplay pads the queue past the end of the
 *                   playlist with similar tracks that are NOT on it: a run on a
 *                   254-track playlist collected 273. Repeat-context should
 *                   make the queue wrap to the start instead, so the run ends
 *                   with "no new tracks" rather than with contamination.
 *
 * THE RATE LIMIT — READ BEFORE RUNNING
 * ------------------------------------
 * Spotify counts requests per APPLICATION over a rolling 30 second window, and
 * a development-mode app has a low ceiling. An earlier version of this probe
 * fired ~45 requests in under 30 seconds and earned a `Retry-After` of 81731
 * seconds — 22.7 hours of total lockout for that Client ID.
 *
 * Therefore:
 *   - Only scan SHORT playlists: 50-100 tracks, i.e. 3-5 jumps.
 *   - Keep JUMP_DELAY_MS at 3000 or higher. Do not "just speed it up".
 *   - Never fetch the ground truth without a delay between pages.
 *   - On the first 429, STOP. Retrying into a limit deepens it.
 *   - The limit is per Client ID: a second Spotify app can be used to keep
 *     working while one is cooling down (paste its id in the app's Settings).
 *
 * HOW TO RUN
 * ----------
 * 1. Open Spotify (desktop) and play anything for a second, so a device is
 *    active. Do not use a running game — its timers fight with this script.
 * 2. Open the app at 127.0.0.1:5173, logged in, NOT mid-round.
 * 3. Paste this whole file into the console at once (it uses top-level await
 *    inside an IIFE, so partial pastes will fail).
 * 4. Do not touch Spotify while it runs.
 *
 * It mutes the player, turns shuffle off and repeat on, and restores volume,
 * shuffle and repeat in a `finally` — including when it throws.
 */
(async () => {
  const JUMP_DELAY_MS = 3000;
  const MAX_JUMPS = 8; // ~168 tracks; deliberately low, see the rate limit note
  const FOREIGN_PLAYLIST_ID = "1c4SvK47rKj7MA9KL4jXQv"; // swap for a SHORT one

  const token = JSON.parse(localStorage.getItem("jtm-s.spotify-tokens")).accessToken;
  const auth = { Authorization: "Bearer " + token };
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  /** One request. A 429 aborts the whole run rather than retrying into it. */
  async function call(path, method = "GET", payload) {
    const response = await fetch("https://api.spotify.com/v1" + path, {
      method,
      headers: method === "GET" ? auth : { ...auth, "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (response.status === 429) {
      const after = response.headers.get("Retry-After");
      throw new Error(
        `429 na ${path}. Retry-After: ${after ?? "nieczytelny przez CORS — sprawdź w zakładce Network"}. PRZERYWAM.`,
      );
    }

    let body = null;
    try {
      body = await response.json();
    } catch {}

    return { code: response.status, body };
  }

  async function harvest(playlistId, label) {
    const found = new Map();
    let position = 0;

    for (let jump = 0; jump < MAX_JUMPS; jump += 1) {
      const started = await call("/me/player/play", "PUT", {
        context_uri: `spotify:playlist:${playlistId}`,
        offset: { position },
      });

      if (started.code !== 204 && started.code !== 200) {
        return { found, stop: `play ${started.code} @ ${position}` };
      }

      await sleep(JUMP_DELAY_MS);
      const queue = await call("/me/player/queue");

      if (queue.code !== 200) {
        return { found, stop: `queue ${queue.code} @ ${position}` };
      }

      const batch = [queue.body.currently_playing, ...(queue.body.queue ?? [])].filter(Boolean);
      const before = found.size;

      for (const entry of batch) {
        if (entry?.id) found.set(entry.id, entry);
      }

      console.log(
        `  ${label} skok ${jump} @ ${position}: partia ${batch.length}, +${found.size - before}, razem ${found.size}`,
      );

      // The queue wrapped to the start (repeat=context), so the playlist ended.
      if (found.size === before) {
        return { found, stop: `koniec @ ${position}` };
      }

      position += batch.length;
    }

    return {
      found,
      stop: `limit ${MAX_JUMPS} skoków — playlista za długa na skanowanie`,
    };
  }

  try {
    console.log(
      "wyciszam:",
      (await call("/me/player/volume?volume_percent=0", "PUT")).code,
      "| shuffle off:",
      (await call("/me/player/shuffle?state=false", "PUT")).code,
      "| repeat context:",
      (await call("/me/player/repeat?state=context", "PUT")).code,
    );

    // --- A. an owned playlist: scan against the truth from /items ---
    const me = await call("/me");
    await sleep(500);
    const all = await call("/me/playlists?limit=50");
    const sized = all.body.items
      .filter((p) => p?.owner?.id === me.body.id)
      .map((p) => ({ p, n: p.items?.total ?? 0 }));
    // Small on purpose: validation does not need a big playlist, and a big one
    // is exactly what trips the rate limit.
    const pick = sized.filter((x) => x.n >= 20 && x.n <= 120).sort((a, b) => b.n - a.n)[0];

    if (!pick) {
      console.log("A. pominięte — brak własnej playlisty w przedziale 20-120 utworów");
    } else {
      console.log("A. walidacja na:", pick.p.name, "| wg API:", pick.n);

      const truth = new Set();
      for (let offset = 0; ; offset += 50) {
        const page = await call(`/playlists/${pick.p.id}/items?limit=50&offset=${offset}`);
        if (page.code !== 200) {
          console.log("   prawda urwana:", page.code);
          break;
        }
        for (const row of page.body?.items ?? []) {
          if (row?.item?.id) truth.add(row.item.id);
        }
        if (!page.body?.next) break;
        await sleep(1000); // never page without a gap
      }
      console.log("A. prawda:", truth.size, "z", pick.n);

      const scan = await harvest(pick.p.id, "A");
      const missing = [...truth].filter((id) => !scan.found.has(id));
      const extra = [...scan.found.keys()].filter((id) => !truth.has(id));
      console.log(
        "A. WYNIK — prawda:",
        truth.size,
        "| skan:",
        scan.found.size,
        "| BRAKUJE:",
        missing.length,
        "| NADMIAROWE:",
        extra.length,
        "| stop:",
        scan.stop,
      );
    }

    // --- B. a playlist the API refuses to list ---
    const foreign = await harvest(FOREIGN_PLAYLIST_ID, "B");
    const sample = [...foreign.found.values()][0];
    console.log("B. cudza — zebrano:", foreign.found.size, "| stop:", foreign.stop);
    console.log("B. próbka:", sample?.name, "|", sample?.duration_ms, "ms |", sample?.id);
  } finally {
    console.log(
      "przywracam — głośność:",
      (await call("/me/player/volume?volume_percent=60", "PUT")).code,
      "| repeat off:",
      (await call("/me/player/repeat?state=off", "PUT")).code,
    );
  }
})();
