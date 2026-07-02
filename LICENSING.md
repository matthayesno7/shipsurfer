# Shipyard licensing — how the paid model works

Shipyard runs **locally** on each user's machine, so we monetise it the ShipFast
way: a **one-time $99 license key**, gated by a tiny hosted validation service.
That service is the *only* thing we host — it never sees a user's GitHub,
Supabase, Railway or Cloudflare tokens (those never leave the user's machine).

## The flow

```
Purchase                         Activate                    Use
────────                         ────────                    ───
shipyard.dev/buy                 $ shipyard activate KEY      $ npx shipyard
   │                                  │                            │
   ▼                                  ▼                            ▼
Stripe Checkout ($99)            saved to                    server boot calls
   │                             ~/.shipyard/license.json     ensureLicensed()
   ▼                                                              │
Stripe webhook ──► license server                                ▼
   │              mints SHIPYARD-XXXX-XXXX-XXXX           POST /validate {key}
   ▼              stores + emails it                             │
customer gets key ◄──────────────────────────────────  valid? boot + open wizard
                                                         invalid? show buy link
```

## The pieces (all built)

- **`license-server/`** — the one hosted component.
  - `POST /checkout` → creates a Stripe Checkout Session ($99 one-time).
    (In `SIMULATE=true` it mints a key instantly so you can test with no Stripe.)
  - `POST /webhook` → Stripe calls this on payment; we mint + store the key
    (and would email it).
  - `POST /validate` → the local CLI calls this on launch.
- **`src/license.ts`** — the client gate.
  - `ensureLicensed()` reads `~/.shipyard/license.json`, validates online, caches
    the result, and allows a **7-day offline grace** so a flaky connection
    doesn't lock paying users out.
  - Boots only if licensed; otherwise prints the buy link.
- **CLI commands** — `shipyard activate <key>` and `shipyard buy`.

## Going live with Stripe

1. Create a **one-time $99 Price** in the Stripe dashboard → put its id in
   `STRIPE_PRICE_ID`.
2. Set `STRIPE_SECRET_KEY` and `SIMULATE=false`.
3. Add a webhook endpoint pointing at `/webhook`, subscribe to
   `checkout.session.completed`, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
4. Deploy `license-server/` anywhere cheap (Railway, Fly, a $5 VPS). Point
   `SHIPYARD_LICENSE_URL` at it.

## Honest notes

- **Piracy is possible** (the code runs locally) — but ShipFast/Lemon-style
  products prove people pay for convenience, updates and trust. Don't over-invest
  in DRM.
- **One-time vs annual:** one-time $99 is the lowest-friction launch. A `$99/yr`
  renewal (for updates + support) is a one-line change if you want recurring
  revenue later.
- **Extra margin:** a small markup on domains bought through the flow adds
  per-deploy revenue on top of the license.
- **This service is low-risk to host:** it only stores keys + emails, never cloud
  credentials. A breach leaks license keys, not anyone's infrastructure.
