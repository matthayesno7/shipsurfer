# Showing the Shipyard demo

A zero-config, fully **simulated** version of Shipyard — the whole experience
from landing page to a "live" app, with no accounts, no license, no payment, and
no build step. Perfect for walking people through the idea.

## Run it

From the `shipyard/` folder:

```bash
node demo.js
```

(or `npm run demo`)

It starts a tiny local server and opens your browser at the homepage. No
installation, no dependencies — just Node.

## The click-through

It opens on the **homepage**. From there:

1. **Home** — the single-card pitch: headline, $99 price, what you get.
2. Click **Get Shipyard** → **Payment** (simulated Stripe, card prefilled).
3. **Pay $99** → a license key is generated and "activated."
4. **Continue to setup** → the **wizard**: project detected → connect accounts →
   choose database + domain → review → watch it "ship" → 🎉 live URL.

Everything is faked client-side, so you can click any path freely and nothing
real happens. There's a light/dark toggle (🌙) in the top corner of each page.

## Pages (if you want to jump straight to one)

- `http://localhost:3939/` — homepage
- `http://localhost:3939/onboarding.html` — payment → wizard
- `http://localhost:3939/wizard.html` — the setup wizard only

## Note

This is the **demo** layer only. The real engine (the GitHub/Supabase/Railway/
Cloudflare provisioning, the license server, the OAuth flows) lives in `src/`,
`license-server/`, and runs via `npm run dev`. The demo doesn't touch any of it —
it's purely the UI story for showing people.
