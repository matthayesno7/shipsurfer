# Shipyard — Claude Code command

Adds a `/ship` slash command to Claude Code that deploys the current project to
a live URL via the Shipyard backend.

## Install

Copy the command into your Claude Code commands directory:

```bash
mkdir -p ~/.claude/commands
cp commands/ship.md ~/.claude/commands/ship.md
```

(Or symlink it so updates flow through.)

## Use

1. Start the Shipyard server (see the main `SETUP.md`): `npm run dev`.
2. Connect GitHub + Railway once at `http://localhost:4000`.
3. In any project, inside Claude Code, type:

   ```
   /ship
   ```

Claude will run `shipyard ship`, stream the provisioning steps, and hand you the
live URL.
