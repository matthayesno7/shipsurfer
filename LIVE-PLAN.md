# Shipyard — plan to go live

From working prototype → real deploys. Roughly a phase a sitting.

## Phase 0 — Verify the real APIs  *(no accounts needed; I can do this)*
- Confirm against current docs: Railway GraphQL mutation names/shapes, Supabase
  Management API (create project + fetch keys), GitHub App permissions, Cloudflare
  Registrar API request bodies.
- Output: a checklist of any code tweaks needed in `src/providers/*`.

## Phase 1 — Register the apps  *(your accounts; ~30 min)*
- **GitHub App** (repo create + push) → App ID, client id/secret, private key.
- **Railway OAuth app** → client id/secret.
- Drop them into `.env`, set `DRY_RUN=false`.

## Phase 2 — First real deploy (GitHub + Railway)
- Run one genuine ship: repo created, code pushed, deployed to a live
  `*.up.railway.app` URL. This is the proof everything else builds on.
- Fix anything the real APIs surface (the most likely place for surprises).

## Phase 3 — Wire the wizard to the backend
- Connect buttons → the real `/connect/*` OAuth routes.
- "Ship it" → real `POST /api/ship`, poll status into the progress screen.
- Now the UI drives real deploys end to end.

## Phase 4 — Add the database (Supabase)
- Supabase OAuth app → connect → auto-provision project → inject DATABASE_URL +
  keys into the deploy. This is the headline value; do it before domains.

## Phase 5 — Add domains (Cloudflare)
- Cloudflare account with billing + Registrar API token → buy domain, point DNS,
  attach to Railway, TLS. (Registrar API is beta — confirm supported TLDs.)

## Phase 6 — Turn on payments
- Create the $99 Stripe Price + webhook, deploy `license-server/` somewhere cheap
  (Railway/Fly), point `SHIPYARD_LICENSE_URL` at it. Flip `SIMULATE=false`.

## Phase 7 — Package & distribute
- Publish `shipyard` to npm so `npx shipyard` works for anyone.
- Ship the Claude skill (the `/ship` + launcher) so users just ask Claude.

## Phase 8 — Private beta
- 3–5 real users (you first). Watch where real projects break detection/deploy.
- Then open the buy page.

---

**Critical path to a first real deploy:** Phase 0 → 1 → 2.
**Biggest risk:** real API drift in Phase 2 (Railway/Supabase). Budget time there.
**What needs you vs me:** I can do Phase 0 now; Phases 1/5/6 need your accounts;
the rest is code I can build and you test.
