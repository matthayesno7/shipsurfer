# ShipSurfer — final test (run today, on your Mac)

Two parts. **Part 1 is the one that matters:** the exact journey a stranger will
take, from the install one-liner to a live URL. **Part 2** ticks the remaining
TEST-PLAN scenarios. If Part 1 goes green, you can post for testers today.

---

## 0. Pre-flight (2 min, terminal)

```bash
# license server up + stripe wired
curl -s https://api.shipsurfer.app/health
# expect: { ok, stripe: true, freeBeta: false, ... }

# installer reachable
curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | head -5

# buy page loads (open in browser)
open https://api.shipsurfer.app/buy
# site + signup form
open https://shipsurfer.app
```

Any failure here → fix before touching the app. (Sandbox couldn't reach these
from Cowork, so this is unverified as of this morning.)

## 1. Cleanup — start truly clean (5 min)

- [ ] Railway dashboard: delete orphan projects (`shipyard-realtest`, random-named ones). Keep `shipsurfer-license`.
- [ ] Supabase dashboard: delete orphan test projects.
- [ ] Cloudflare: remove old `realtest*` / `demo` CNAME+TXT records (keep `demo2` and `api`).
- [ ] Local state:

```bash
rm -rf ~/.shipsurfer/app
rm -f ~/.shipyard/license.json
rm -f "$HOME/Documents/Claude/Projects/New business/shipyard/.shipyard/"{users,apps,jobs}.json
```

---

## Part 1 — The tester journey (do exactly what a stranger would)

- [ ] **Install:** `curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | bash`
- [ ] **Start:** `~/.shipsurfer/shipsurfer` → app at http://localhost:4001
- [ ] **Skill:** open `New business/hello-shipsurfer` in Claude Code → say **"ship this with ShipSurfer"** → browser opens to `/surfing`
- [ ] **Buy:** hit the license gate → Stripe checkout → card `4242 4242 4242 4242` → key auto-activates (no terminal, no copy-paste)
- [ ] **Connect:** GitHub → Railway → Supabase, all green in one chained flow, **zero secrets asked for**
- [ ] **Ship** with the free-subdomain option → steps stream → live at `https://<name>.shipsurfer.app`
- [ ] **Verify:** page loads with a **clean HTTPS cert** (no browser warning) and shows the app

**If all seven boxes tick, ShipSurfer is tester-ready.** Anything that fails:
capture the exact error + step (that's the fix list).

---

## Part 2 — Remaining TEST-PLAN scenarios (30 min)

Using `shipsurfer-demo/` (shows "✓ Database connected" when DATABASE_URL is injected):

- [ ] **DB tier:** ship it → live page shows **"✓ Database connected"**
- [ ] **Re-deploy:** ship the same app again → log shows *reused* → **no duplicate** Railway/Supabase projects
- [ ] **Tier 0:** ship with `--no-db` / Railway-URL option → live `*.up.railway.app`
- [ ] **Domain search:** check a `.com` in the UI → returns available/taken + price (don't buy)
- [ ] **UI ship:** from `/surfing` directly (no skill), paste folder, Ship it → works

## Success = launch

- Part 1 fully green (this is the stranger's experience)
- Zero duplicate projects on re-deploy
- Zero manual dashboard steps anywhere

Then: post for testers (see `LAUNCH-POSTS.md`) and watch the beta signups land
at the license server.
