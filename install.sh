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

# 3. env file
if [ ! -f "$DIR/.env" ]; then
  cp "$DIR/.env.example" "$DIR/.env"
  dim "created .env — add the OAuth credentials we sent you before first run."
fi

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
echo "  1. Add credentials to  $DIR/.env   (the file we sent you)"
echo "  2. Start ShipSurfer:   ~/.shipsurfer/shipsurfer"
echo "  3. In Claude Code, open your project and say:  \"ship this with ShipSurfer\""
echo
dim "The skill is installed for Claude Code. First run: buy (free in beta) → connect accounts → ship."
