# Phase 1 — register the two apps (≈30 min)

Do these in order. Everything assumes your local server runs on **port 4001**
(set `BASE_URL=http://localhost:4001` in `.env` so the callback URLs match). If
you use a different port, change `4001` everywhere below.

At the end you'll have 6 values in `.env` and `DRY_RUN=false`.

---

## Part A — GitHub App  (lets Shipyard create the repo + push)

1. Go to **https://github.com/settings/apps** → **New GitHub App**.
2. **GitHub App name:** `Shipyard` (or `Shipyard Local` — must be globally unique).
3. **Homepage URL:** `http://localhost:4001`
4. **Callback URL:** `http://localhost:4001/connect/github/callback`
5. Tick **☑ Request user authorization (OAuth) during installation**.
6. **Webhook:** untick **☐ Active** (not needed).
7. **Permissions → Repository:**
   - **Administration** → **Read and write**
   - **Contents** → **Read and write**
8. **Where can this app be installed:** "Only on this account".
9. Click **Create GitHub App**. Now collect 4 values on the app's page:

   | On the page | Put in `.env` as |
   |---|---|
   | **App ID** (top of the page) | `GITHUB_APP_ID` |
   | **Client ID** | `GITHUB_CLIENT_ID` |
   | Click **Generate a new client secret** | `GITHUB_CLIENT_SECRET` |
   | Scroll to **Private keys** → **Generate a private key** (downloads a `.pem`) | see next step |

10. For the private key: easiest is to save the downloaded `.pem` somewhere and
    set its path:
    ```
    GITHUB_PRIVATE_KEY_PATH=/Users/matt/Downloads/shipyard.YYYY-MM-DD.private-key.pem
    ```
    (Use the actual filename. Leave `GITHUB_PRIVATE_KEY` blank if you use the path.)

11. Back on the app page, click **Install App** → install it on your account so
    Shipyard can act on your repos.

---

## Part B — Railway OAuth App  (lets Shipyard deploy)

1. Go to **Railway → your Workspace → Settings → Developer → New OAuth App**
   (https://railway.com → workspace settings → Developer).
2. **Name:** `Shipyard`
3. **Redirect URI:** `http://localhost:4001/connect/railway/callback`
4. Create it, then copy:

   | On the page | Put in `.env` as |
   |---|---|
   | **Client ID** | `RAILWAY_CLIENT_ID` |
   | **Client Secret** | `RAILWAY_CLIENT_SECRET` |

---

## Part C — finish `.env`

Open `.env` and make sure these are all set:

```
PORT=4001
BASE_URL=http://localhost:4001
DRY_RUN=false        # ← flip this from true

GITHUB_APP_ID=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_PRIVATE_KEY_PATH=/Users/matt/Downloads/shipyard.....private-key.pem

RAILWAY_CLIENT_ID=...
RAILWAY_CLIENT_SECRET=...
```

(`SHIPYARD_SECRET` is already set from earlier. Leave Supabase/Cloudflare blank —
those are later phases.)

---

## Part D — start it (still needs your license running)

You need the license server running + a key activated (you did this earlier; the
key is saved). Two terminals:

**Tab 1 — license server**
```
cd "/Users/matt/Documents/Claude/Projects/New business/shipyard/license-server"
SIMULATE=true PORT=8787 npm start
```

**Tab 2 — Shipyard (live mode)**
```
cd "/Users/matt/Documents/Claude/Projects/New business/shipyard"
npm run build
SHIPYARD_LICENSE_URL=http://localhost:8787 npm run dev
```

Open **http://localhost:4001** → you should see the dashboard with the badge now
showing **LIVE** (not DRY-RUN). Click **Connect** for GitHub, then Railway, and
approve each.

When both show connected, tell me — that's Phase 2, the first real deploy. ✅

---

### Gotchas
- **Callback URL mismatch** is the #1 error — it must be exactly
  `http://localhost:4001/connect/<github|railway>/callback`, matching `BASE_URL`.
- If GitHub connect fails to create a repo, confirm you **installed** the app
  (Part A step 11), not just created it.
- Keep `SHIPYARD_LICENSE_URL=http://localhost:8787` in Tab 2 so the gate checks
  your local license server.
