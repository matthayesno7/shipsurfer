# ⚓ Shipyard v0.1

One-click production deployment for apps built with Claude Code.

You build locally, click **Ship**, and Shipyard creates a GitHub repo, pushes
your code, deploys it to Railway, and hands you a live URL — using *your own*
accounts, connected once via OAuth.

> **Real (live) scope today:** GitHub + Railway → live `*.up.railway.app` URL.
> **Simulated (dry-run) scope:** the *full* vision — GitHub → Supabase database →
> Railway deploy → Cloudflare domain purchase + DNS → verify. Run it in dry-run to
> watch the entire pipeline before connecting any real accounts. Supabase and
> Cloudflare become real in v0.2 / v0.3. See `../shipyard-spec.md` for the roadmap.

## What's here

```
shipyard/
├── src/
│   ├── server.ts            # Express API + OAuth connect routes
│   ├── config.ts            # env loading
│   ├── crypto.ts            # AES-256-GCM token encryption at rest
│   ├── store.ts             # file-backed user/job store (swap for Postgres later)
│   ├── oauth/               # GitHub + Railway OAuth flows
│   ├── providers/           # GitHub (Octokit) + Railway (GraphQL) clients
│   └── provision/engine.ts  # REPO → DEPLOY → VERIFY state machine
├── cli/
│   ├── ship.ts              # `shipyard ship` — runs in your project folder
│   └── detect.ts            # local stack detection
├── dashboard/index.html     # connect accounts + watch deploys
└── claude-plugin/           # /ship slash command for Claude Code
```

## Quickstart (dry-run — no accounts needed)

Dry-run simulates every external call so you can see the whole flow first.

```bash
npm install
cp .env.example .env
# set SHIPYARD_SECRET (any 32+ random chars); leave DRY_RUN=true
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # paste into SHIPYARD_SECRET

npm run dev                      # starts http://localhost:4000
# in another terminal, inside any project folder:
npx ts-node /path/to/shipyard/cli/ship.ts --server http://localhost:4000
```

You'll watch the repo → deploy → verify steps run and get a simulated live URL.

To simulate the **full** pipeline — database and a purchased domain too:

```bash
npx ts-node /path/to/shipyard/cli/ship.ts \
  --server http://localhost:4000 \
  --domain mysaasapp.com
# (a Supabase database is provisioned by default; use --no-db to skip)
```

This runs repo → Supabase → deploy (with DATABASE_URL + keys injected) → buy
domain + point DNS + TLS → verify, ending at `https://mysaasapp.com`. Nothing
real is created in dry-run.

## Going live

Set `DRY_RUN=false` and fill in the GitHub App + Railway OAuth credentials.
Full walkthrough in **[SETUP.md](./SETUP.md)**.

## Security note

Shipyard custodies OAuth tokens to your GitHub and Railway accounts. v0.1
encrypts them at rest (AES-256-GCM) and is intended to run **locally on your own
machine**. Do not expose this server publicly until the token model is hardened
for multi-tenant use (per-tenant KMS keys, short-lived tokens, audit log) — see
spec §6.
