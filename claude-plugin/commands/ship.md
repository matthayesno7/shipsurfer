---
description: Ship the current project to a live URL with Shipyard (GitHub + Railway)
---

You are running the **Shipyard** deploy command for the user's current project.

Steps:

1. Confirm the Shipyard server is reachable at `http://localhost:4000` (or the
   URL in `$SHIPYARD_SERVER`). If not, tell the user to start it with
   `npm run dev` in the Shipyard folder, and stop.

2. From the **root of the current project**, run:

   ```bash
   npx shipyard ship
   ```

   (If `shipyard` isn't linked globally, run it via the Shipyard repo:
   `node /path/to/shipyard/dist/cli/ship.js` or `npm run ship` inside that repo
   with the project path passed in.)

3. Stream the command's output to the user. It will:
   - detect the project's stack,
   - create a GitHub repo and push the code,
   - deploy to Railway,
   - verify and return a live `*.up.railway.app` URL.

4. When it finishes, report the **live URL** clearly. If it fails because
   GitHub or Railway isn't connected, tell the user to open the Shipyard
   dashboard at `http://localhost:4000` and click Connect for each, then retry.

Keep your narration short — the user mainly wants the final URL.
