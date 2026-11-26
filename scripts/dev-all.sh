#!/usr/bin/env bash
#
# Everything at once: the local database, the Worker, and the front end wired
# to it. One terminal, one Ctrl+C.
#
# The pieces can all be started by hand — see the README — but three terminals
# and an environment variable is exactly the kind of thing that gets typed
# wrong at eleven at night, and the Worker takes a few seconds to come up, so
# starting the front end first gives you an app that quietly has no backend.
#
#   npm run dev:all
#   JTM_CREATOR=<spotify-id> npm run dev:all   # may create universes locally
#   PORT=8788 npm run dev:all                  # if 8787 is taken
#
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
API="http://127.0.0.1:$PORT"
VARS="server/.dev.vars"

# Kills the Worker along with the front end, whichever of them stops first:
# a wrangler left running in the background holds the port, and the next run
# then fails for a reason that has nothing to do with the code.
cleanup() {
  trap - EXIT INT TERM
  kill 0
}
trap cleanup EXIT INT TERM

# Secrets for a local run. Never overwritten: the key is what signs this
# machine's sessions, and changing it signs you out.
if [ ! -f "$VARS" ]; then
  echo "Zakładam $VARS z nowym kluczem sesji."
  {
    echo "SESSION_SECRET=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
    echo "# Konta Spotify, które mogą tworzyć uniwersa. Swoje ID zobaczysz na"
    echo "# ekranie Uniwersum po połączeniu konta."
    echo "UNIVERSE_CREATORS="
    echo "ALLOWED_ORIGINS=http://127.0.0.1:5173"
  } > "$VARS"
fi

if [ -n "${JTM_CREATOR:-}" ]; then
  # Written in rather than exported: the Worker reads this file, and having to
  # remember the variable on every run is how it ends up missing.
  if grep -q '^UNIVERSE_CREATORS=' "$VARS"; then
    sed -i "s|^UNIVERSE_CREATORS=.*|UNIVERSE_CREATORS=$JTM_CREATOR|" "$VARS"
  else
    echo "UNIVERSE_CREATORS=$JTM_CREATOR" >> "$VARS"
  fi
  echo "Uniwersa może tworzyć: $JTM_CREATOR"
else
  echo "Uniwersa może tworzyć: $(grep '^UNIVERSE_CREATORS=' "$VARS" | cut -d= -f2-)"
  echo "  (puste albo nie Twoje ID? uruchom: JTM_CREATOR=<twoje-id-spotify> npm run dev:all)"
fi

# Said plainly rather than left to wrangler, which fails with a stack trace.
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  exec 3<&-
  echo "Port $PORT jest zajęty — zatrzymaj to, co tam nasłuchuje, albo: PORT=8788 npm run dev:all" >&2
  exit 1
fi

# Safe to run every time: the schema is written with IF NOT EXISTS, so this is
# both the first setup and the migration for a database that has some of it.
echo "Zakładam tabele w lokalnej bazie…"
npm run --workspace @jtm-s/server db:local --silent > /dev/null

echo "Startuję Workera na $API…"
npm run --workspace @jtm-s/server dev --silent -- --port "$PORT" --ip 127.0.0.1 2>&1 |
  sed 's/^/[worker] /' &

# The front end is built with the backend's address baked in, so it is worth
# waiting until there is something at that address.
for _ in $(seq 1 60); do
  if curl -sf -m 1 "$API/" > /dev/null; then
    echo "Worker odpowiada."
    break
  fi

  sleep 1
done

if ! curl -sf -m 1 "$API/" > /dev/null; then
  echo "Worker nie wstał w ciągu minuty — zobacz [worker] powyżej." >&2
  exit 1
fi

echo "Startuję front z VITE_API_URL=$API…"
VITE_API_URL="$API" npm run dev --silent
