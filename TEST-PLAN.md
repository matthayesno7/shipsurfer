# ShipSurfer — clean end-to-end test plan

Goal: prove the whole flow works **from a clean slate**, like a brand-new user —
connect accounts → ship a brand-new app → live on each domain tier → re-deploy
with no duplicates. Today's testing left a lot of accumulated state; this is the
"does it really work for someone new" run.

---

## A. Pre-test fixes — ✅ DONE

1. **Subdomain TLS — SOLVED (fully automated).** Root cause: Railway exposes the
   `_railway-verify` TXT via `status.verificationDnsHost` / `verificationToken`,
   NOT in `dnsRecords`. Fix: pull both and auto-create the **DNS-only CNAME + TXT**
   in Cloudflare. Confirmed live end-to-end at `demo2.shipsurfer.app` (green ✓ in
   Railway, clean HTTPS, zero manual steps). Proxy approach abandoned — it breaks
   Railway's CNAME verification.
2. **Supabase token refresh — DONE.** All three providers (GitHub, Railway,
   Supabase) now auto-refresh their tokens before use.
3. **Cleanup (you do this before the run):** delete the orphan Railway projects
   (`shipyard-realtest`, random-named ones), orphan Supabase projects, and the old
   `realtest` / `realtest2` / `demo` custom domains + their Cloudflare records, so
   the test starts clean. (Keep `demo2` if you like — it's the good reference.)
4. Debug probes removed.

---

## B. Clean-slate setup (tomorrow, ~5 min)

1. Stop the server.
2. **Clear local state** (forces a fresh connect + no reuse memory):
   ```bash
   cd "…/shipyard" && rm -f .shipyard/users.json .shipyard/apps.json .shipyard/jobs.json
   ```
3. Confirm `.env`: all creds present, `DRY_RUN=false`, `PORT=4001`.
   - **New credentials option:** if you want a truly cold test, regenerate the
     Cloudflare token and/or re-create the GitHub App + Railway/Supabase OAuth
     apps and update `.env`. (Heavier — only if you want to validate the operator
     setup too. Otherwise a fresh *connect* is enough.)
4. Start: `SHIPYARD_LICENSE_KEY=dev npm run dev`.
5. Open `http://localhost:4001/surfing` → **Connect accounts** → approve GitHub →
   Railway → Supabase fresh. *(Tests the connect chain cold.)*

---

## C. New test app

Use the fresh app already created at **`shipsurfer-demo/`** — a different minimal
Express app (so it's a genuinely new repo + project). Its page shows
**"✓ Database connected"** when `DATABASE_URL` is injected, so the DB tier is
visually verifiable.

---

## D. Test scenarios (run in order, tick each)

- [ ] **Connect chain** — GitHub + Railway + Supabase all go green in one flow.
- [ ] **Tier 0 — Railway URL:** `ship … --no-db` → live `*.up.railway.app`.
- [ ] **Database tier:** `ship …` (db on) → Supabase project created, env wired;
      the live page shows **"✓ Database connected"**.
- [ ] **Re-deploy (reuse):** ship the same app again → log shows *reused* DB +
      Railway project; **no duplicates** appear in the Railway/Supabase dashboards.
- [ ] **Tier 1 — subdomain:** `ship … --subdomain demo` → **2 DNS records set** →
      `https://demo.shipsurfer.app` loads with a **valid cert, no warning**.
      *(This is the proof the TXT fix worked.)*
- [ ] **Domain search (Tier 2 front half):** `ship.js check <name>.com` → returns
      available/taken + price.
- [ ] **UI ship:** from `/surfing`, paste the folder, pick the subdomain option,
      hit **🏄 Ship it** → steps stream, app goes live.
- [ ] **Skill:** in Claude Code, open `shipsurfer-demo`, say **"ship my app"** →
      it ships the current folder, no fields typed.

---

## E. Success criteria

- App reachable on Tier 0 and Tier 1; **subdomain has a clean HTTPS cert** (no
  browser warning) — this is the headline we couldn't quite land today.
- DB tier shows "✓ Database connected" on the live page.
- Re-deploys create **zero** duplicate Railway/Supabase projects.
- No manual Cloudflare or Railway dashboard steps required anywhere.

## F. Capture
For anything that fails: copy the **exact error + which step**, plus the relevant
dashboard state. That's the fix list — same loop that got us this far.

---

### Where we are going in
Connect, repo, database, deploy, reuse, token refresh, and the free-subdomain
*plumbing* all work against live APIs. The **one** thing not yet fully landed is
the subdomain's **TLS cert**, blocked solely by the missing TXT record — fix A.1.
Land that, and tomorrow's clean run should go green end to end.
