#!/usr/bin/env bash
#
# Interactive helper for role-playing the ShipSurfer customer journey inside a
# sandbox (e.g. Cowork), one step per call. Each invocation is self-contained:
# it boots the dry-run ShipSurfer server + SIMULATE license server, performs one
# step, prints machine-readable output, and tears everything down. State that
# must survive between steps (the minted key + saved license) lives under a
# FIXED demo home in the repo, so a later call can see what an earlier one wrote.
#
#   scripts/demo-step.sh ship        # attempt a ship (shows 402 if unlicensed)
#   scripts/demo-step.sh pay         # mint a license key ("customer paid $99")
#   scripts/demo-step.sh activate KEY# save the key on this machine
#   scripts/demo-step.sh reset       # forget the license (fresh customer)
#
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STEP="${1:-}"
LIC_PORT=8799
SHIP_PORT=4099
DEMO_HOME="$ROOT/.demo-home"          # fixed → persists across calls
DEMO_CWD="$ROOT/.demo-run"            # isolated token store (empty)
LIC_STORE="$ROOT/license-server/.licenses.json"
mkdir -p "$DEMO_HOME" "$DEMO_CWD"

jf() { node -pe "JSON.parse(require('fs').readFileSync(0)).$1" 2>/dev/null; }

boot_license() {
  PORT=$LIC_PORT SIMULATE=true node "$ROOT/license-server/server.js" >/tmp/demo-lic.log 2>&1 &
  LIC_PID=$!
  for _ in $(seq 1 40); do curl -s "http://localhost:${LIC_PORT}/health" >/dev/null 2>&1 && break; sleep 0.25; done
}
boot_ship() {
  ( cd "$DEMO_CWD" && HOME="$DEMO_HOME" DRY_RUN=true SHIPYARD_SECRET=demo \
      SHIPYARD_LICENSE_URL="http://localhost:${LIC_PORT}" \
      SHIPYARD_BUY_URL="http://localhost:${LIC_PORT}/buy" \
      PORT=$SHIP_PORT node "$ROOT/dist/src/server.js" >/tmp/demo-ship.log 2>&1 ) &
  SHIP_PID=$!
  for _ in $(seq 1 40); do curl -s "http://localhost:${SHIP_PORT}/api/status" >/dev/null 2>&1 && break; sleep 0.25; done
}
teardown() { [[ -n "${LIC_PID:-}" ]] && kill "$LIC_PID" 2>/dev/null; [[ -n "${SHIP_PID:-}" ]] && kill "$SHIP_PID" 2>/dev/null; }
trap teardown EXIT

BODY='{"appName":"shipsurfer-demo","localPath":"/tmp/demo","stack":{"framework":"node"},"provisionDb":false}'

case "$STEP" in
  reset)
    rm -f "$DEMO_HOME/.shipyard/license.json"
    echo "STATUS=reset  (license forgotten — this is now a brand-new customer)"
    ;;

  ship)
    boot_license; boot_ship
    RESP=$(curl -s -w $'\n%{http_code}' -X POST "http://localhost:${SHIP_PORT}/api/ship" \
            -H "Content-Type: application/json" -d "$BODY")
    CODE=$(printf '%s' "$RESP" | tail -1); B=$(printf '%s' "$RESP" | sed '$d')
    if [[ "$CODE" == "402" ]]; then
      echo "STATUS=needs_license"
      echo "HTTP=$CODE"
      echo "MESSAGE=$(printf '%s' "$B" | jf error)"
      echo "BUY_URL=$(printf '%s' "$B" | jf buyUrl)"
    else
      JOB=$(printf '%s' "$B" | jf id)
      echo "STATUS=shipping  HTTP=$CODE  JOB=$JOB"
      for _ in $(seq 1 90); do
        J=$(curl -s "http://localhost:${SHIP_PORT}/api/ship/${JOB}"); ST=$(printf '%s' "$J" | jf status)
        [[ "$ST" == "live" ]]   && { echo "STATUS=live  URL=$(printf '%s' "$J" | jf liveUrl)"; break; }
        [[ "$ST" == "failed" ]] && { echo "STATUS=failed  ERROR=$(printf '%s' "$J" | jf error)"; break; }
        sleep 1
      done
    fi
    ;;

  pay)
    boot_license
    KEY=$(curl -s -X POST "http://localhost:${LIC_PORT}/checkout" \
            -H "Content-Type: application/json" -d '{"email":"you@example.com"}' | jf key)
    echo "STATUS=paid  KEY=$KEY"
    ;;

  activate)
    KEY="${2:-}"
    [[ -z "$KEY" ]] && { echo "STATUS=error  MESSAGE=usage: activate <KEY>"; exit 1; }
    HOME="$DEMO_HOME" node "$ROOT/dist/cli/ship.js" activate "$KEY" >/dev/null 2>&1
    echo "STATUS=activated  KEY=$KEY"
    ;;

  *)
    echo "usage: demo-step.sh {ship|pay|activate <KEY>|reset}"; exit 1 ;;
esac
