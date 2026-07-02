#!/usr/bin/env bash
#
# ShipSurfer — replay the full paying-customer journey, end to end:
#
#     ship (no license) → 402 + buy link → pay $99 → activate → re-ship → live
#
# Everything runs in DRY-RUN mode against a local SIMULATE license server, in an
# isolated $HOME, so it NEVER touches your real GitHub / Railway / Supabase /
# Cloudflare accounts or your real ~/.shipyard/license.json. Safe to run anytime.
#
#   npm run demo:journey
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LIC_PORT=8799          # local license server (offset from the real 8787)
SHIP_PORT=4099         # ShipSurfer server   (offset from the real 4001)
BUY_URL="http://localhost:${LIC_PORT}/buy"
DEMO_HOME="$(mktemp -d)"   # isolated home → real license file untouched
SHIP_BODY='{"appName":"shipsurfer-demo","localPath":"/tmp/demo","stack":{"framework":"node"},"provisionDb":false}'

b()   { printf "\033[1m%s\033[0m" "$1"; }
dim() { printf "\033[2m%s\033[0m" "$1"; }
grn() { printf "\033[32m%s\033[0m" "$1"; }
red() { printf "\033[31m%s\033[0m" "$1"; }

cleanup() {
  [[ -n "${LIC_PID:-}"  ]] && kill "$LIC_PID"  2>/dev/null
  [[ -n "${SHIP_PID:-}" ]] && kill "$SHIP_PID" 2>/dev/null
  rm -rf "$DEMO_HOME"
}
trap cleanup EXIT

echo
b "🏄  ShipSurfer — customer journey demo"; echo
dim "    dry-run · no real accounts touched · isolated license"; echo; echo

# Build if the compiled output is missing.
if [[ ! -f dist/src/server.js || ! -f dist/cli/ship.js ]]; then
  dim "    building…"; echo
  npm run build >/dev/null 2>&1 || { red "build failed"; echo; exit 1; }
fi

# 1) local license server (SIMULATE mints keys instantly, no charge)
PORT=$LIC_PORT SIMULATE=true node license-server/server.js >/tmp/demo-lic.log 2>&1 &
LIC_PID=$!

# 2) ShipSurfer server — dry-run, license gate ON, pointed at the local license
#    server. Runs in the isolated HOME *and* an isolated working dir, so its token
#    store (.shipyard/ under cwd) is empty and your real encrypted tokens are never
#    read. Dry-run tolerates having no connections.
( cd "$DEMO_HOME" && HOME="$DEMO_HOME" DRY_RUN=true SHIPYARD_SECRET=demo \
    SHIPYARD_LICENSE_URL="http://localhost:${LIC_PORT}" \
    SHIPYARD_BUY_URL="$BUY_URL" \
    PORT=$SHIP_PORT node "$ROOT/dist/src/server.js" >/tmp/demo-ship.log 2>&1 ) &
SHIP_PID=$!

# Wait for both to answer.
for _ in $(seq 1 40); do
  curl -s "http://localhost:${SHIP_PORT}/api/status" >/dev/null 2>&1 \
    && curl -s "http://localhost:${LIC_PORT}/health" >/dev/null 2>&1 && break
  sleep 0.5
done

jf() { node -pe "JSON.parse(require('fs').readFileSync(0)).$1" 2>/dev/null; }

# ── 1. Ship with no license ──────────────────────────────────────────────────
b "1."; echo "  Customer: \"ship my app\"  →  POST /api/ship  (no license yet)"
RESP=$(curl -s -w $'\n%{http_code}' -X POST "http://localhost:${SHIP_PORT}/api/ship" \
        -H "Content-Type: application/json" -d "$SHIP_BODY")
CODE=$(printf '%s' "$RESP" | tail -1)
BODY=$(printf '%s' "$RESP" | sed '$d')
printf '   %s\n' "$(dim "→ HTTP $CODE")"
printf '   %s\n' "$(red "$(printf '%s' "$BODY" | jf error)")"
printf '   %s\n\n' "$(dim "buy at: $(printf '%s' "$BODY" | jf buyUrl)")"

# ── 2. Pay ───────────────────────────────────────────────────────────────────
b "2."; echo "  Customer clicks \"Pay \$99\" at $BUY_URL"
KEY=$(curl -s -X POST "http://localhost:${LIC_PORT}/checkout" \
        -H "Content-Type: application/json" -d '{"email":"you@example.com"}' | jf key)
printf '   %s  %s\n\n' "$(dim "key minted:")" "$(grn "$KEY")"

# ── 3. Activate ──────────────────────────────────────────────────────────────
b "3."; echo "  Customer runs:  shipsurfer activate $KEY"
HOME="$DEMO_HOME" node dist/cli/ship.js activate "$KEY" 2>&1 | sed 's/^/   /'
echo

# ── 4. Re-ship → live ────────────────────────────────────────────────────────
b "4."; echo "  Re-ship  →  license valid, provisioning runs (dry-run)"
RESP=$(curl -s -w $'\n%{http_code}' -X POST "http://localhost:${SHIP_PORT}/api/ship" \
        -H "Content-Type: application/json" -d "$SHIP_BODY")
CODE=$(printf '%s' "$RESP" | tail -1)
JOB=$(printf '%s' "$RESP" | sed '$d' | jf id)
printf '   %s\n' "$(dim "→ HTTP $CODE   job $JOB")"

if [[ -n "$JOB" && "$JOB" != "undefined" ]]; then
  for _ in $(seq 1 90); do
    J=$(curl -s "http://localhost:${SHIP_PORT}/api/ship/${JOB}")
    ST=$(printf '%s' "$J" | jf status)
    case "$ST" in
      live)   printf '   %s\n' "$(grn "✓ live: $(printf '%s' "$J" | jf liveUrl)")"; break;;
      failed) printf '   %s\n' "$(red "✗ failed: $(printf '%s' "$J" | jf error)")"; break;;
    esac
    sleep 1
  done
fi

echo
b "That's the full paid journey — 402 → pay → activate → ship."; echo
dim "    Real accounts and your real license were never touched."; echo
