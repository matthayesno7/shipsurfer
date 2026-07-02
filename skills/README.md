# ShipSurfer skill for Claude Code

Lets a Claude Code user deploy their app just by asking — "ship my app",
"deploy this", "put this live" — instead of running any commands themselves.

## Install

Copy the skill into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills
cp -r "skills/shipsurfer" ~/.claude/skills/shipsurfer
```

(Or symlink it so updates flow through:
`ln -s "$(pwd)/skills/shipsurfer" ~/.claude/skills/shipsurfer`)

## Use

1. Make sure ShipSurfer is running: `SHIPYARD_LICENSE_KEY=dev npm run dev` (in the
   ShipSurfer folder), and your accounts are connected at
   http://localhost:4001/surfing.
2. In Claude Code, inside any project, just say:

   > **ship my app**

Claude detects the skill, checks ShipSurfer is up and connected, runs the deploy in
your project folder, and hands you the live URL.

## How it maps to the product

- **Today (local/dev):** the skill calls the local CLI at the path in `SKILL.md`,
  and you start the server manually.
- **When published:** the skill calls `npx shipsurfer ship`, which boots the local
  server and opens the connect browser automatically — so the user truly just asks
  Claude and approves a couple of screens.

The skill is the front door that makes "ask Claude to ship it" real.
