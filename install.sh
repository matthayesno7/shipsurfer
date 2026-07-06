#!/usr/bin/env bash
#
# ShipSurfer installer — one-line setup for testers.
#
#   curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | bash
#
# Clones ShipSurfer, installs deps, builds, and installs the Claude Code skill.
# It does NOT need root and touches only ~/.shipsurfer and ~/.claude/skills.
#
set -euo pipefail

REPO="${SHIPSURFER_REPO:-https://github.com/matthayesno7/shipsurfer.git}"
DIR="${SHIPSURFER_DIR:-$HOME/.shipsurfer/app}"
SKILLS="$HOME/.claude/skills"

b()   { printf "\033[1m%s\033[0m\n" "$1"; }
dim() { printf "\033[2m%s\033[0m\n" "$1"; }
grn() { printf "\033[32m%s\033[0m\n" "$1"; }

b "🏄  Installing ShipSurfer…"

command -v git  >/dev/null || { echo "git is required"; exit 1; }
command -v node >/dev/null || { echo "Node.js 18+ is required (https://nodejs.org)"; exit 1; }

# 1. clone or update
if [ -d "$DIR/.git" ]; then
  dim "updating existing install…"
  git -C "$DIR" pull --ff-only
else
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi

# 2. install + build
cd "$DIR"
dim "installing dependencies…"
npm install --silent
dim "building…"
npm run build >/dev/null

# 3. env file — the template holds no secrets (all connections go through the
# hosted broker), so keep it in sync with the latest template on every install.
# Back up any existing file just in case the user customised it.
if [ -f "$DIR/.env" ] && ! cmp -s "$DIR/.env" "$DIR/.env.example"; then
  cp "$DIR/.env" "$DIR/.env.bak"
fi
cp "$DIR/.env.example" "$DIR/.env"
dim "wrote .env (no secrets needed — connections go through api.shipsurfer.app)."

# 4. install the Claude Code skill
mkdir -p "$SKILLS"
rm -rf "$SKILLS/shipsurfer"
cp -r "$DIR/skills/shipsurfer" "$SKILLS/shipsurfer"

# 5. convenience launcher on PATH (best-effort)
LAUNCH="$HOME/.shipsurfer/shipsurfer"
cat > "$LAUNCH" <<EOF
#!/usr/bin/env bash
cd "$DIR" && exec npm start
EOF
chmod +x "$LAUNCH"

grn "✓ ShipSurfer installed."
echo
b "Next:"
echo "  In Claude Code, open your project and say:  \"ship this with ShipSurfer\""
echo
dim "No setup needed — ShipSurfer starts itself. First ship: get your license (free in beta), connect accounts, ship."
