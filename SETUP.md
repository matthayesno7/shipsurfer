# Shipyard v0.1 — Setup

Two paths: **dry-run** (no accounts, see the flow) and **live** (real deploys).

---

## 1. Install & dry-run

```bash
cd shipyard
npm install
cp .env.example .env
```

Generate a secret and paste it into `.env` as `SHIPYARD_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Leave `DRY_RUN=true`. Start the server:

```bash
npm run dev
```

Open <http://localhost:4000> — you'll see the dashboard with a **DRY-RUN** badge.
Now ship any project (the folder you run it in is what gets "deployed"):

```bash
cd ~/some-project
npx ts-node /absolute/path/to/shipyard/cli/ship.ts
```

You'll see the full `repo → deploy → verify` chain run and a simulated live URL.
Nothing real is created.

---

## 2. Go live

Set `DRY_RUN=false` in `.env`, then create the two OAuth apps below.

### 2a. GitHub App

Repo creation on a **personal** account needs a user OAuth token, so we use a
GitHub App (it gives both an install identity and a user-token OAuth flow).

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in:
   - **Homepage URL:** `http://localhost:4000`
   - **Callback URL:** `http://localhost:4000/connect/github/callback`
   - **Request user authorization (OAuth) during installation:** ✅
   - **Webhook:** uncheck Active (not needed for v0.1).
3. **Permissions → Repository:** Administration = Read & write, Contents = Read & write.
4. Create the App, then:
   - copy the **App ID** → `GITHUB_APP_ID`
   - copy the **Client ID** → `GITHUB_CLIENT_ID`
   - generate a **Client secret** → `GITHUB_CLIENT_SECRET`
   - generate a **private key** (.pem). Either set `GITHUB_PRIVATE_KEY_PATH` to
     the file, or paste its contents into `GITHUB_PRIVATE_KEY` (newlines as `\n`).

### 2b. Railway OAuth App

1. Railway → **Workspace Settings → Developer → New OAuth App**.
2. **Redirect URI:** `http://localhost:4000/connect/railway/callback`.
3. Copy the **Client ID** → `RAILWAY_CLIENT_ID` and **Client secret** →
   `RAILWAY_CLIENT_SECRET`.

> Railway's GraphQL schema supports introspection. If a mutation name in
> `src/providers/railwayClient.ts` has drifted, confirm against the live schema
> at <https://backboard.railway.com/graphql/v2> and adjust. The four mutations
> used are `projectCreate`, `serviceCreate`, `variableCollectionUpsert`,
> `serviceDomainCreate`.

### 2c. Connect & ship

```bash
npm run build        # compile
npm start            # run the compiled server
```

1. Open <http://localhost:4000>, click **Connect** for GitHub, then Railway.
2. In any project: `npx ts-node /path/to/shipyard/cli/ship.ts`
   (or link the CLI globally — see below).
3. Watch the live URL appear.

### 2d. (optional) Global `shipyard` command + Claude Code

```bash
npm run build
npm link             # makes `shipyard` available globally
cp claude-plugin/commands/ship.md ~/.claude/commands/ship.md
```

Then inside Claude Code, in any project, type `/ship`.

---

## Troubleshooting

- **"github not connected"** — open the dashboard and connect both providers; in
  live mode both are required before `/api/ship` will run.
- **CLI can't reach server** — confirm `npm run dev`/`npm start` is up on the
  port in `.env`, and pass `--server http://localhost:PORT` if you changed it.
- **Push fails** — ensure `git` is installed and the project folder is a real
  directory you can write to; Shipyard runs `git` against it directly in v0.1.
- **Railway mutation error** — likely schema drift; see the note in 2b.
