import { config } from "../config";
import { log } from "../logger";
import { getConnection, saveConnection, saveJob, getAppState, saveAppState } from "../store";
import * as railwayOAuth from "../oauth/railway";
import * as githubOAuth from "../oauth/github";
import * as supabaseOAuth from "../oauth/supabase";
import { ShipJob, ShipStep } from "../types";
import * as github from "../providers/githubClient";
import { deployFromRepo, addCustomDomain } from "../providers/railwayClient";
import { provisionDatabase } from "../providers/supabaseClient";
import { checkAvailability, registerDomain, pointDns } from "../providers/cloudflareClient";

/*
 * The provisioning state machine. Each step is idempotent and updates the job
 * as it goes, so the dashboard/CLI can poll status. A failure stops the chain
 * and records the error.
 *
 * Full chain:  REPO → DATABASE → DEPLOY → DOMAIN → VERIFY
 *   - DATABASE runs BEFORE deploy so its creds become the single source of
 *     truth injected into the Railway env (spec §5.2 — kills DATABASE_URL drift).
 *   - DOMAIN runs AFTER deploy because it needs Railway's DNS target to point at.
 * DATABASE and DOMAIN are skipped when not requested.
 */

function now() {
  return new Date().toISOString();
}

function setStep(job: ShipJob, key: ShipStep["key"], patch: Partial<ShipStep>) {
  const step = job.steps.find((s) => s.key === key);
  if (step) Object.assign(step, patch);
  job.updatedAt = now();
  saveJob(job);
}

export function newJob(input: {
  id: string;
  userId: string;
  appName: string;
  localPath: string;
  stack: ShipJob["stack"];
  provisionDb: boolean;
  domain?: string;
  subdomain?: string;
}): ShipJob {
  const steps: ShipStep[] = [
    { key: "repo", label: "Create repo & push code", status: "pending" },
  ];
  if (input.provisionDb)
    steps.push({ key: "database", label: "Provision Supabase database", status: "pending" });
  steps.push({ key: "deploy", label: "Deploy to Railway", status: "pending" });
  if (input.domain)
    steps.push({ key: "domain", label: "Register domain & point DNS", status: "pending" });
  else if (input.subdomain)
    steps.push({ key: "domain", label: "Set up shipsurfer.app subdomain", status: "pending" });
  steps.push({ key: "verify", label: "Verify live URL", status: "pending" });

  const job: ShipJob = {
    ...input,
    status: "queued",
    steps,
    createdAt: now(),
    updatedAt: now(),
  };
  saveJob(job);
  return job;
}

export async function runJob(job: ShipJob): Promise<ShipJob> {
  try {
    log.info(`Shipping "${job.appName}"${config.dryRun ? " (dry-run)" : ""}`);

    // ── Step 1: REPO ──────────────────────────────────────────────────────
    job.status = "repo";
    setStep(job, "repo", { status: "running", startedAt: now() });

    const gh = getConnection(job.userId, "github");
    if (!gh && !config.dryRun) throw new Error("GitHub not connected");

    // GitHub App user tokens expire (~8h) — refresh before using.
    let ghToken = gh?.accessToken || "dry";
    if (gh?.refreshToken && !config.dryRun) {
      try {
        const t = await githubOAuth.refresh(gh.refreshToken);
        saveConnection(job.userId, {
          provider: "github",
          accessToken: t.accessToken,
          refreshToken: t.refreshToken || gh.refreshToken,
          account: gh.account,
          scopes: gh.scopes,
          connectedAt: gh.connectedAt,
        });
        ghToken = t.accessToken;
        log.ok("refreshed GitHub token");
      } catch {
        log.warn("GitHub token refresh failed — using existing token");
      }
    }

    const repo = await github.createRepo(ghToken, job.appName);
    github.pushLocalRepo(job.localPath, repo);
    job.repoUrl = repo.htmlUrl;
    setStep(job, "repo", { status: "done", finishedAt: now(), detail: repo.fullName });

    // Env assembled across steps is the single source of truth for the deploy.
    const env: Record<string, string> = {};
    if (job.stack.port) env.PORT = String(job.stack.port);

    // ── Step 2: DATABASE (optional) ───────────────────────────────────────
    if (job.provisionDb) {
      job.status = "database";
      setStep(job, "database", { status: "running", startedAt: now() });

      // Reuse an existing database for this app instead of creating a new
      // Supabase project on every deploy.
      const existing = getAppState(job.appName).supabaseCreds;
      let db;
      let reused = false;
      if (existing) {
        db = existing;
        reused = true;
        log.ok(`reusing existing Supabase database ${db.projectRef}`);
      } else {
        const sb = getConnection(job.userId, "supabase");
        if (!sb && !config.dryRun) throw new Error("Supabase not connected");
        // Supabase tokens expire — refresh before using.
        let sbToken = sb?.accessToken || "dry";
        if (sb?.refreshToken && !config.dryRun) {
          try {
            const t = await supabaseOAuth.refresh(sb.refreshToken);
            saveConnection(job.userId, {
              provider: "supabase",
              accessToken: t.accessToken,
              refreshToken: t.refreshToken || sb.refreshToken,
              account: sb.account,
              scopes: sb.scopes,
              connectedAt: sb.connectedAt,
            });
            sbToken = t.accessToken;
            log.ok("refreshed Supabase token");
          } catch {
            log.warn("Supabase token refresh failed — using existing token");
          }
        }
        db = await provisionDatabase({
          token: sbToken,
          projectName: job.appName,
        });
        saveAppState(job.appName, { supabaseCreds: db });
      }
      // Inject DB creds into the deploy env — generated once, used everywhere.
      env.DATABASE_URL = db.DATABASE_URL;
      env.SUPABASE_URL = db.SUPABASE_URL;
      env.SUPABASE_ANON_KEY = db.SUPABASE_ANON_KEY;
      env.SUPABASE_SERVICE_ROLE_KEY = db.SUPABASE_SERVICE_ROLE_KEY;
      job.dbProjectRef = db.projectRef;
      setStep(job, "database", {
        status: "done",
        finishedAt: now(),
        detail: `${db.projectRef} · ${reused ? "reused existing DB" : "DATABASE_URL + keys wired in"}`,
      });
    }

    // ── Step 3: DEPLOY ────────────────────────────────────────────────────
    job.status = "deploy";
    setStep(job, "deploy", { status: "running", startedAt: now() });

    const rw = getConnection(job.userId, "railway");
    if (!rw && !config.dryRun) throw new Error("Railway not connected");

    // Railway access tokens expire after 1 hour — refresh before using.
    let rwToken = rw?.accessToken || "dry";
    if (rw?.refreshToken && !config.dryRun) {
      try {
        const t = await railwayOAuth.refresh(rw.refreshToken);
        saveConnection(job.userId, {
          provider: "railway",
          accessToken: t.accessToken,
          refreshToken: t.refreshToken || rw.refreshToken,
          account: rw.account,
          scopes: rw.scopes,
          connectedAt: rw.connectedAt,
        });
        rwToken = t.accessToken;
        log.ok("refreshed Railway token");
      } catch {
        log.warn("Railway token refresh failed — using existing token");
      }
    }

    // Reuse the existing Railway project for this app. The git push in the repo
    // step auto-triggers a redeploy on the connected service, so we don't create
    // a new project/service each time.
    const existingRw = getAppState(job.appName).railway;
    let deploy;
    if (existingRw) {
      deploy = existingRw;
      log.ok(`reusing Railway project — redeploying via push (${deploy.liveUrl})`);
    } else {
      deploy = await deployFromRepo({
        token: rwToken,
        projectName: job.appName,
        repoFullName: repo.fullName,
        branch: repo.defaultBranch,
        env,
        port: job.stack.port,
      });
      saveAppState(job.appName, {
        railway: {
          projectId: deploy.projectId,
          serviceId: deploy.serviceId,
          environmentId: deploy.environmentId,
          liveUrl: deploy.liveUrl,
        },
      });
    }
    job.liveUrl = deploy.liveUrl;
    setStep(job, "deploy", {
      status: "done",
      finishedAt: now(),
      detail: `${deploy.liveUrl}${existingRw ? " · redeployed" : job.provisionDb ? " · " + Object.keys(env).length + " env vars" : ""}`,
    });

    // ── Step 4: DOMAIN (optional) ─────────────────────────────────────────
    // Tier 2 = job.domain (buy a domain the user owns).
    // Tier 1 = job.subdomain (free <sub>.shipsurfer.app on ShipSurfer's zone).
    const customDomain = job.domain;
    const subHost = job.subdomain
      ? `${job.subdomain}.${config.cloudflare.shipsurferDomain}`
      : undefined;
    const targetHost = customDomain || subHost;

    if (targetHost) {
      job.status = "domain";
      setStep(job, "domain", { status: "running", startedAt: now() });

      // Domains use ShipSurfer's OWN Cloudflare account (reseller / own zone) —
      // there is no per-user Cloudflare connection.
      let priceNote = "free subdomain";
      if (customDomain) {
        const avail = await checkAvailability(customDomain);
        if (!avail.available) throw new Error(`${customDomain} is not available to register`);
        await registerDomain(customDomain); // buy it (user-owned)
        priceNote = avail.price;
      }

      // Attach the host on Railway → required DNS records (CNAME + TXT).
      const { records } = await addCustomDomain({
        token: rwToken,
        projectId: deploy.projectId,
        environmentId: deploy.environmentId,
        serviceId: deploy.serviceId,
        domain: targetHost,
      });

      // DNS-only (not proxied): Railway verifies the CNAME resolves to its
      // target and issues TLS. Proxying breaks Railway's CNAME verification.
      const zone = customDomain || config.cloudflare.shipsurferDomain;
      await pointDns(zone, records, false);

      job.registeredDomain = targetHost;
      job.liveUrl = `https://${targetHost}`;
      setStep(job, "domain", {
        status: "done",
        finishedAt: now(),
        detail: `${targetHost} (${priceNote}) · ${records.length} DNS records set`,
      });
    }

    // ── Step 5: VERIFY ────────────────────────────────────────────────────
    job.status = "verify";
    setStep(job, "verify", { status: "running", startedAt: now() });
    const healthy = await verify(job.liveUrl!);
    setStep(job, "verify", {
      status: healthy ? "done" : "failed",
      finishedAt: now(),
      detail: healthy ? "200 OK" : "no response yet (build/DNS may still be propagating)",
    });

    job.status = "live";
    job.updatedAt = now();
    saveJob(job);
    log.ok(`Done — ${job.liveUrl}`);
    return job;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = "failed";
    job.error = msg;
    const running = job.steps.find((s) => s.status === "running");
    if (running) setStep(job, running.key, { status: "failed", detail: msg });
    job.updatedAt = now();
    saveJob(job);
    log.error(`Ship failed: ${msg}`);
    return job;
  }
}

async function verify(url: string): Promise<boolean> {
  if (config.dryRun) {
    log.ok(`[dry-run] would health-check ${url}`);
    return true;
  }
  // Railway builds can take several minutes — poll for up to ~5 minutes. Any
  // HTTP response under 500 means the app is serving (even a 404 route).
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}
