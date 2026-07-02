# 🏄 ShipSurfer — Tester Guide

Thanks for testing ShipSurfer. It takes an app you built with Claude and gets it
**live** — GitHub repo, database, hosting, and a domain — on *your own* accounts,
without touching a terminal. During the beta it's **free**.

## What you need
- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- A **Claude Code** setup on your Mac
- Accounts you'll connect once: **GitHub**, **Railway**, **Supabase** (free tiers are fine)

## 1. Install (one line)
```bash
curl -fsSL https://raw.githubusercontent.com/matthayesno7/shipsurfer/main/install.sh | bash
```
This installs ShipSurfer and the Claude Code skill. Then drop the **`.env` file we
sent you** into `~/.shipsurfer/app/.env` (it holds the connection settings).

## 2. Start ShipSurfer
```bash
~/.shipsurfer/shipsurfer
```
Leave it running. It lives at `http://localhost:4001`.

## 3. Ship your app
1. Open your project in **Claude Code** (the folder with your app).
2. Say: **"ship this with ShipSurfer."**
3. ShipSurfer opens in your browser. First time only:
   - **Get your license** — at checkout, use the test card **4242 4242 4242 4242**
     (any future expiry + any CVC), or enter the **discount code** we sent you. No
     real charge during the beta. Your key appears right after — activate it.
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
