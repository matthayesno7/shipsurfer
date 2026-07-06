# 🏄 ShipSurfer — Tester Guide

Thanks for testing ShipSurfer. It takes an app you built with Claude and gets it
**live** — GitHub repo, database, hosting, and a domain — on *your own* accounts,
without touching a terminal. During the beta it's **free**.

## What you need
- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- A **Claude Code** setup on your Mac
- Accounts you'll connect once: **GitHub**, **Railway**, **Supabase** (free tiers are fine)

## 1. Install (paste into Claude Code)

Open Claude Code and paste:

> Install ShipSurfer for me:
> `curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | bash`

Claude will look the script over and run it (say yes when it asks). That's it —
no settings, no config files. *(Prefer Terminal? The same one-liner works there.)*

## 2. Ship your app
1. Open your project in **Claude Code** (the folder with your app).
2. Say: **"ship this with ShipSurfer."** — it starts ShipSurfer for you and
   opens it in your browser.
3. **Connect** GitHub, Railway, and Supabase (first time only). If a provider
   page stalls on "return to the app", switch back to the ShipSurfer tab — it
   finishes automatically.
4. Pick how it goes live, then hit **Get license & ship**. Checkout uses test
   card **4242 4242 4242 4242** (any future expiry + any CVC — no real charge
   during the beta); your key activates itself and the ship starts. Watch the
   surfer — you'll get a live URL in a few minutes.

Returning? Skip straight to shipping — license and connections are remembered.

## Domain options
- **Railway URL** — instant, free (`your-app.up.railway.app`)
- **Free `you.shipsurfer.app` subdomain** — clean, free, HTTPS
- **Buy your own domain** — search and register right in the app

## Hit a snag?
Whatever error the app shows is specific — send it to us verbatim and we'll sort it.
Feedback of any kind is hugely welcome. 🌊
