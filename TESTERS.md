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
3. First time only:
   - **Get your license** — at checkout, use the test card **4242 4242 4242 4242**
     (any future expiry + any CVC). No real charge during the beta. Your key
     activates automatically.
   - **Connect** GitHub, Railway, and Supabase (one time)
4. Pick a domain option and hit **Ship**. Watch the surfer — you'll get a live URL in a few minutes.

Returning? Skip straight to shipping — license and connections are remembered.

## Domain options
- **Railway URL** — instant, free (`your-app.up.railway.app`)
- **Free `you.shipsurfer.app` subdomain** — clean, free, HTTPS
- **Buy your own domain** — search and register right in the app

## Hit a snag?
Whatever error the app shows is specific — send it to us verbatim and we'll sort it.
Feedback of any kind is hugely welcome. 🌊
