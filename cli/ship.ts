#!/usr/bin/env node
import * as path from "path";
import { Command } from "commander";
import { detectStack, suggestAppName } from "./detect";
import { saveKey, BUY_URL } from "../src/license";

/*
 * `shipyard ship` — the local command Claude Code (or you) runs in a project.
 * It detects the stack, then asks the Shipyard backend to provision + deploy,
 * streaming step progress to the terminal.
 */

const ICON: Record<string, string> = {
  pending: "○",
  running: "◐",
  done: "✓",
  failed: "✗",
};
const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function main() {
  const program = new Command();
  program
    .name("shipyard")
    .description("Ship the app in this folder to a live URL")
    .option("--name <name>", "app name (default: folder name)")
    .option("--server <url>", "Shipyard server URL", "http://localhost:4000")
    .option("--domain <domain>", "buy a custom domain you own and point it (e.g. myapp.com)")
    .option("--subdomain <label>", "free shipsurfer.app subdomain (e.g. myapp → myapp.shipsurfer.app)")
    .option("--db", "provision a Supabase database and wire its env into the deploy")
    .option("--no-db", "skip database provisioning")
    .action(
      async (opts: {
        name?: string;
        server: string;
        domain?: string;
        subdomain?: string;
        db?: boolean;
      }) => {
        const cwd = process.cwd();
        const stack = detectStack(cwd);
        const appName = (opts.name || suggestAppName(cwd)).toLowerCase();
        // commander sets opts.db=false when --no-db is passed; default to true
        // so the full pipeline (with a DB) runs unless explicitly skipped.
        const provisionDb = opts.db !== false;

        console.log(C.bold("\n🏄 ShipSurfer\n"));
        console.log(`  ${C.dim("project")}    ${path.basename(cwd)}`);
        console.log(`  ${C.dim("framework")}  ${stack.framework}`);
        console.log(`  ${C.dim("name")}       ${appName}`);
        console.log(`  ${C.dim("database")}   ${provisionDb ? "Supabase (provision)" : "none"}`);
        const domainLabel = opts.domain
          ? opts.domain + " (buy)"
          : opts.subdomain
          ? opts.subdomain + ".shipsurfer.app (free)"
          : "Railway URL";
        console.log(`  ${C.dim("domain")}     ${domainLabel}`);
        console.log(`  ${C.dim("server")}     ${opts.server}\n`);

      let id: string;
      try {
        const res = await fetch(`${opts.server}/api/ship`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appName,
            localPath: cwd,
            stack,
            provisionDb,
            domain: opts.domain,
            subdomain: opts.subdomain,
          }),
        });
        const body = (await res.json()) as {
          id?: string; error?: string; needsLicense?: boolean; buyUrl?: string;
        };
        if (res.status === 402 || body.needsLicense) {
          console.error(C.red("\n✗ You need a ShipSurfer license to ship ($99, one-time, lifetime)."));
          if (body.buyUrl) console.error(C.bold(`  Buy here: ${body.buyUrl}`));
          console.error(C.dim("  After paying, activate your key:  shipsurfer activate <YOUR-KEY>\n"));
          process.exit(1);
        }
        if (!res.ok || !body.id) {
          console.error(C.red(`✗ ${body.error || res.statusText}`));
          if (body.error?.includes("not connected")) {
            console.error(
              C.dim(`  Open ${opts.server} and connect GitHub + Railway first.`)
            );
          }
          process.exit(1);
        }
        id = body.id;
      } catch (e) {
        console.error(C.red(`✗ Could not reach Shipyard at ${opts.server}`));
        console.error(C.dim(`  Is the server running?  npm run dev`));
        process.exit(1);
      }

      // Poll until terminal state. Tolerate transient errors — the server can
      // briefly stop responding during synchronous work (e.g. git push).
      const seen = new Set<string>();
      for (;;) {
        let job: any;
        try {
          job = await fetch(`${opts.server}/api/ship/${id}`).then((r) => r.json());
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        for (const s of job.steps) {
          const key = `${s.key}:${s.status}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const color =
            s.status === "done"
              ? C.green
              : s.status === "failed"
              ? C.red
              : s.status === "running"
              ? C.blue
              : C.dim;
          const detail = s.detail ? C.dim(` — ${s.detail}`) : "";
          if (s.status !== "pending") {
            console.log(`  ${color(ICON[s.status])} ${s.label}${detail}`);
          }
        }
        if (job.status === "live") {
          console.log(`\n${C.green("✓ Live:")} ${C.bold(job.liveUrl)}\n`);
          process.exit(0);
        }
        if (job.status === "failed") {
          console.log(`\n${C.red("✗ Failed:")} ${job.error}\n`);
          process.exit(1);
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    });

  program
    .command("activate <key>")
    .description("save your Shipyard license key on this machine")
    .action((key: string) => {
      saveKey(key.trim());
      console.log(C.green(`\n✓ License saved. You're all set — run shipyard to launch.\n`));
    });

  program
    .command("buy")
    .description("open the purchase page")
    .action(() => {
      console.log(`\nBuy a lifetime ShipSurfer license ($99):\n  ${BUY_URL}\n`);
    });

  program
    .command("check <domain>")
    .description("check if a domain is available to buy (no purchase)")
    .option("--server <url>", "ShipSurfer server URL", "http://localhost:4001")
    .action(async (domain: string, opts: { server: string }) => {
      try {
        const r = (await fetch(
          `${opts.server}/api/domain/check?domain=${encodeURIComponent(domain)}`
        ).then((res) => res.json())) as { available?: boolean; price?: string; error?: string };
        if (r.error) {
          console.error(C.red(`✗ ${r.error}`));
          process.exit(1);
        }
        if (r.available) {
          console.log(C.green(`✓ ${domain} is available`) + (r.price ? C.dim(` — ${r.price}`) : ""));
        } else {
          console.log(C.red(`✗ ${domain} is taken`));
        }
      } catch {
        console.error(C.red(`✗ Could not reach ShipSurfer at ${opts.server}`));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
