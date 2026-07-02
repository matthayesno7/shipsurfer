# Phase 0 — API verification findings

Checked the four provider APIs against current docs and applied the fixes to
`src/providers/*`. Code still typechecks and the dry-run pipeline runs clean.

## ✅ Railway — mostly correct, 2 tweaks applied
- `projectCreate`, `serviceCreate` (with `source: { repo }`, `branch`),
  `variableCollectionUpsert` ({projectId, environmentId, serviceId, variables}),
  `customDomainCreate` → all match the live schema.
- **Fixed:** `serviceDomainCreate` now passes `targetPort` (the app's port) so
  Railway routes correctly instead of returning 404s.
- **Fixed:** `customDomainCreate` now includes `projectId` in its input.
- *To confirm on first run:* that `projectCreate` returns `environments.edges[0]`
  (verify via the GraphiQL playground — introspection is on).

## ⚠️ Supabase — two real gaps, both fixed
- **Fixed (important):** `organization_id` is **required** by `POST /v1/projects`.
  Code now fetches the user's org (`GET /v1/organizations`) and passes it.
- **Fixed (important):** the database URL must use the **session pooler**, not the
  direct host. Railway has no outbound IPv6, and `db.<ref>.supabase.co` is
  IPv6-only — it would fail. Now uses
  `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
- **Fixed:** API-keys endpoint now calls `?reveal=true` to get the real key values.
- *Note:* don't pass `desired_instance_size` (keeps the free Nano tier) — code
  already omits it.

## ✅ GitHub — correct
- Creating a repo on a personal account via the user OAuth token
  (`createForAuthenticatedUser`) with the `repo` scope is right. Push via
  `x-access-token:<token>@github.com/...` works for OAuth tokens.

## ⚠️ Cloudflare — simplified to match beta
- **Fixed:** register body is now just `{ name }` (the only required field). Billing
  uses the account's default payment profile and default registrant contact.
- *Operational prerequisites (not code):* the Cloudflare account needs a default
  registrant contact + a billing profile, and Registrar API access (beta). Renewals/
  transfers aren't in the API yet. Confirm supported TLDs before promising domains.

---

## What this means
None of the gaps block the build — they're now fixed in code. The two that would
have actually broken a real run (Supabase `organization_id` and the IPv6/pooler
DATABASE_URL) are caught. The rest will be confirmed the moment we do a real
deploy with your accounts.

## Your move — Phase 1 (≈30 min, needs your accounts)
1. **GitHub App** → App ID, client id/secret, private key (.pem).
2. **Railway OAuth app** → client id/secret.
3. Paste into `.env`, set `DRY_RUN=false`.
Full click-by-click is in `SETUP.md` §2. Then we do Phase 2: the first real
deploy (GitHub + Railway → live URL). Supabase + Cloudflare come after.
