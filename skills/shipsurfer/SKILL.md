---
name: shipsurfer
description: Ship or deploy the app in the current project to production with ShipSurfer. Opens the ShipSurfer app where the user buys a license (once), connects their accounts, and ships — creating a GitHub repo, database, hosting, and a domain on their own accounts. Trigger when the user says "ship this with ShipSurfer", "ship my app", "deploy this", "put this live", "go live", or similar.
---

# ShipSurfer — open the app and ship this project

Your job is simple: **launch the ShipSurfer app in the browser and hand off.** The
user buys, connects their accounts, and ships inside the app (the surfer UI). Don't
run deploys from the terminal — the app does that.

## Config
- App URL: `http://localhost:4001` (override with `$SHIPSURFER_SERVER`)
- App folder: `$HOME/.shipsurfer/app` (where the one-line installer puts it)

## Steps

### 1. Make sure the app is running
```bash
curl -s http://localhost:4001/api/status >/dev/null 2>&1 && echo up || echo down
```
- `up` → continue.
- `down` → start it for the user (background, don't block the chat), then wait a few
  seconds and re-check:
  ```bash
  cd "$HOME/.shipsurfer/app" && npm start >/tmp/shipsurfer.log 2>&1 &
  sleep 4 && curl -s http://localhost:4001/api/status >/dev/null 2>&1 && echo up || echo "still starting"
  ```
  If the folder doesn't exist, the user hasn't installed ShipSurfer yet — point them to
  the one-line installer at https://shipsurfer.app/paddleout.

### 2. Open the app
Open the ShipSurfer home page in the user's browser:
```bash
open http://localhost:4001/home    # macOS
```
Tell the user: *"ShipSurfer's open in your browser. Buy your license, connect your
accounts, and hit Ship — I'll leave the surfing to you. 🏄"*

### 3. Let the app take over
The user does everything from here in the UI:
1. **Buy** — home CTA → `/buy` → pay $99 (one-time, lifetime).
2. **Connect** — approve GitHub, Railway, and Supabase (once).
3. **Ship** — on `/surfing`, pick a domain option and hit Ship; the surfer rides while
   it provisions, then shows the live URL.

You're done. If the user comes back with an error from the app, read it verbatim — the
messages are specific and say exactly what to fix.

## Notes
- License and account connections are one-time; returning users go straight to `/surfing`.
- First ship of an app creates everything; later ships reuse its DB + Railway project.
