import * as path from "path";
import * as crypto from "crypto";
import express, { Request, Response } from "express";
import { z } from "zod";
import { config, assertConfigured } from "./config";
import { log } from "./logger";
import {
  getUser,
  listConnections,
  listJobs,
  getJob,
  saveConnection,
  getConnection,
  getAppState,
} from "./store";
import { newJob, runJob } from "./provision/engine";
import { ensureLicensed, BUY_URL } from "./license";
import * as githubOAuth from "./oauth/github";
import * as railwayOAuth from "./oauth/railway";
import * as supabaseOAuth from "./oauth/supabase";
import { checkAvailability, subdomainAvailable } from "./providers/cloudflareClient";
import { detectStack, suggestAppName, sanitizeAppName } from "./detect";

// v0.1 is single-user and local. v1 introduces real sessions.
const USER = "local";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Static assets (html files, fonts) but don't auto-serve index.html at "/",
// so our named routes below win.
const DASH = path.resolve(__dirname, "../dashboard");
app.use(express.static(DASH, { index: false }));

// Named routes for the flow: home → buy → surfing (connect) → ship.
app.get("/", (_req, res) => res.redirect("/home"));
app.get("/home", (_req, res) => res.sendFile(path.join(DASH, "home.html")));
app.get("/buy", (_req, res) => res.sendFile(path.join(DASH, "onboarding.html")));
app.get("/surfing", (_req, res) => res.sendFile(path.join(DASH, "index.html")));

// CSRF state for OAuth round-trips (in-memory; fine for local single-user).
const oauthState = new Map<string, string>();

// ── Chained connect ──────────────────────────────────────────────────────
// One "Connect accounts" action walks the user through each provider's consent
// screen back-to-back. Each provider must still be approved on its own site
// (OAuth can't merge providers), but the user experiences a single flow.
// Supabase/Cloudflare get appended here once their connect routes exist.
const CHAIN_PROVIDERS = ["github", "railway", "supabase"] as const;
let connectChain: string[] = [];

// After a provider connects, jump to the next one in the chain (or finish).
function advanceChain(res: Response, provider: string) {
  if (connectChain.length && connectChain[0] === provider) {
    connectChain.shift();
    if (connectChain.length) return res.redirect(`/connect/${connectChain[0]}`);
    return res.redirect("/surfing?connected=all");
  }
  return res.redirect(`/surfing?connected=${provider}`);
}

app.get("/connect/all", (_req, res) => {
  const connected = listConnections(USER);
  // Only chain the ones not already connected.
  connectChain = CHAIN_PROVIDERS.filter((p) => !connected.includes(p));
  if (connectChain.length === 0) return res.redirect("/surfing?connected=all");
  res.redirect(`/connect/${connectChain[0]}`);
});

/* ── Status / connections ─────────────────────────────────────────────── */

app.get("/api/status", (_req: Request, res: Response) => {
  const user = getUser(USER);
  const connected = Object.keys(user.connections);
  // account labels are stored in plaintext (only tokens are encrypted)
  const accounts: Record<string, string | undefined> = {};
  for (const p of connected) accounts[p] = user.connections[p as never] && (user.connections as any)[p].account;
  res.json({
    dryRun: config.dryRun,
    connected,
    accounts,
    ready: config.dryRun || (connected.includes("github") && connected.includes("railway")),
    user: user.id,
  });
});

/* ── GitHub connect ───────────────────────────────────────────────────── */

app.get("/connect/github", (_req, res) => {
  const state = crypto.randomUUID();
  oauthState.set(state, "github");
  res.redirect(githubOAuth.authorizeUrl(state));
});

app.get("/connect/github/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query as {
    code?: string; state?: string; error?: string; error_description?: string;
  };
  if (error) {
    return res
      .status(400)
      .send(`GitHub didn't grant access: ${error}` + (error_description ? ` — ${error_description}` : "") + `. <a href="/surfing">Back</a>`);
  }
  if (!state || oauthState.get(state) !== "github") {
    return res.status(400).send("Invalid OAuth state — click Connect again. <a href='/surfing'>Back</a>");
  }
  if (!code) return res.status(400).send("No authorization code returned. <a href='/surfing'>Back</a>");
  oauthState.delete(state);
  try {
    const tok = await githubOAuth.exchangeCode(code);
    const account = await githubOAuth.getLogin(tok.accessToken);
    saveConnection(USER, {
      provider: "github",
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      account,
      scopes: tok.scopes,
      connectedAt: new Date().toISOString(),
    });
    log.ok(`GitHub connected as ${account}`);
    advanceChain(res, "github");
  } catch (e) {
    res.status(500).send(`GitHub connect failed: ${(e as Error).message}`);
  }
});

/* ── Railway connect ──────────────────────────────────────────────────── */

app.get("/connect/railway", (_req, res) => {
  const state = crypto.randomUUID();
  oauthState.set(state, "railway");
  res.redirect(railwayOAuth.authorizeUrl(state));
});

app.get("/connect/railway/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query as {
    code?: string; state?: string; error?: string; error_description?: string;
  };
  if (error) {
    return res
      .status(400)
      .send(
        `Railway didn't grant access: ${error}` +
          (error_description ? ` — ${error_description}` : "") +
          `. On the Railway screen you must pick a workspace and click Authorize. <a href="/surfing">Back</a>`
      );
  }
  if (!state || oauthState.get(state) !== "railway") {
    return res
      .status(400)
      .send("Invalid OAuth state — click Connect again (don't restart the server mid-flow). <a href='/surfing'>Back</a>");
  }
  if (!code) return res.status(400).send("No authorization code returned. <a href='/surfing'>Back</a>");
  oauthState.delete(state);
  try {
    const tok = await railwayOAuth.exchangeCode(code);
    const id = await railwayOAuth.getIdentity(tok.accessToken);
    const account = id.email || id.name || "railway account";
    saveConnection(USER, {
      provider: "railway",
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      account,
      connectedAt: new Date().toISOString(),
    });
    log.ok(`Railway connected as ${account}`);
    advanceChain(res, "railway");
  } catch (e) {
    res.status(500).send(`Railway connect failed: ${(e as Error).message}`);
  }
});

/* ── Supabase connect ─────────────────────────────────────────────────── */

app.get("/connect/supabase", (_req, res) => {
  const state = crypto.randomUUID();
  oauthState.set(state, "supabase");
  res.redirect(supabaseOAuth.authorizeUrl(state));
});

app.get("/connect/supabase/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query as {
    code?: string; state?: string; error?: string; error_description?: string;
  };
  if (error) {
    return res
      .status(400)
      .send(`Supabase didn't grant access: ${error}` + (error_description ? ` — ${error_description}` : "") + `. <a href="/surfing">Back</a>`);
  }
  if (!state || oauthState.get(state) !== "supabase") {
    return res.status(400).send("Invalid OAuth state — click Connect again. <a href='/surfing'>Back</a>");
  }
  if (!code) return res.status(400).send("No authorization code returned. <a href='/surfing'>Back</a>");
  oauthState.delete(state);
  try {
    const tok = await supabaseOAuth.exchangeCode(code);
    saveConnection(USER, {
      provider: "supabase",
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      account: "supabase org",
      connectedAt: new Date().toISOString(),
    });
    log.ok("Supabase connected");
    advanceChain(res, "supabase");
  } catch (e) {
    res.status(500).send(`Supabase connect failed: ${(e as Error).message}`);
  }
});

/* ── Ship ─────────────────────────────────────────────────────────────── */

const ShipBody = z.object({
  // Optional: derived from the folder name server-side when omitted.
  appName: z.string().max(80).optional(),
  localPath: z.string().min(1),
  // Optional: detected server-side from the folder when omitted (lets the
  // dashboard ship by passing just a path).
  stack: z
    .object({
      framework: z.string(),
      buildCommand: z.string().optional(),
      startCommand: z.string().optional(),
      port: z.number().optional(),
    })
    .optional(),
  provisionDb: z.boolean().optional(),
  domain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "domain must look like example.com")
    .optional(),
  subdomain: z
    .string()
    .regex(/^[a-z0-9-]+$/i, "subdomain must be letters, numbers, hyphens")
    .optional(),
});

app.post("/api/ship", async (req: Request, res: Response) => {
  const parsed = ShipBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  // License gate — at ship time (connecting/configuring is free). ensureLicensed
  // honours the SHIPYARD_LICENSE_KEY=dev bypass for development.
  const lic = await ensureLicensed();
  if (!lic.licensed) {
    return res.status(402).json({
      error: "A ShipSurfer license ($99, one-time) is required to ship.",
      needsLicense: true,
      buyUrl: BUY_URL,
    });
  }
  if (!config.dryRun) {
    const conns = listConnections(USER);
    const required: ("github" | "railway" | "supabase" | "cloudflare")[] = [
      "github",
      "railway",
    ];
    if (parsed.data.provisionDb) required.push("supabase");
    if (parsed.data.domain) required.push("cloudflare");
    for (const p of required) {
      if (!conns.includes(p)) {
        return res.status(409).json({ error: `${p} not connected` });
      }
    }
  }
  const localPath = parsed.data.localPath;
  // Detect stack + app name server-side when the caller (e.g. the dashboard)
  // didn't provide them.
  const stack = parsed.data.stack || detectStack(localPath);
  const appName = parsed.data.appName
    ? sanitizeAppName(parsed.data.appName)
    : suggestAppName(localPath);

  // Guard: a free ShipSurfer subdomain must be free — unless THIS app already
  // owns it (so re-deploys of your own subdomain still work).
  if (parsed.data.subdomain && !config.dryRun) {
    const host = `${parsed.data.subdomain.toLowerCase()}.${config.cloudflare.shipsurferDomain}`;
    const ownedAlready = listJobs(USER).some(
      (j) => j.appName === appName && j.registeredDomain === host
    );
    if (!ownedAlready) {
      try {
        if (!(await subdomainAvailable(parsed.data.subdomain))) {
          return res.status(409).json({ error: `${host} is already taken — pick a different subdomain.` });
        }
      } catch {
        /* if the availability check itself errors, don't block the ship */
      }
    }
  }

  const job = newJob({
    id: crypto.randomUUID(),
    userId: USER,
    appName,
    localPath,
    stack,
    provisionDb: parsed.data.provisionDb ?? false,
    domain: parsed.data.domain,
    subdomain: parsed.data.subdomain,
  });
  // Run asynchronously; the client polls /api/ship/:id.
  runJob(job).catch((e) => log.error(String(e)));
  res.status(202).json({ id: job.id });
});

app.get("/api/ship/:id", (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "not found" });
  res.json(job);
});

app.get("/api/ships", (_req: Request, res: Response) => {
  res.json(listJobs(USER));
});

// Is a free ShipSurfer subdomain still available? (not already claimed)
app.get("/api/subdomain/check", async (req: Request, res: Response) => {
  const label = String(req.query.label || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(label)) {
    return res.status(400).json({ error: "letters, numbers and hyphens only" });
  }
  try {
    const available = await subdomainAvailable(label);
    res.json({ label, host: `${label}.${config.cloudflare.shipsurferDomain}`, available });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Domain availability search (no purchase) — used by the "buy a domain" flow.
app.get("/api/domain/check", async (req: Request, res: Response) => {
  const domain = String(req.query.domain || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "domain must look like example.com" });
  }
  try {
    const r = await checkAvailability(domain);
    res.json({ domain, ...r });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});


/* ── Boot ─────────────────────────────────────────────────────────────── */

const missing = assertConfigured();
if (missing.length) {
  log.warn(`Missing config: ${missing.join(", ")}`);
  if (!config.secret) {
    log.error("SHIPYARD_SECRET is required even in dry-run. Set it in .env.");
  }
}

// The server always boots — connecting accounts + configuring is free. The
// license is checked at ship time (POST /api/ship), so payment happens at the
// moment of shipping.
app.listen(config.port, () => {
  log.info(`ShipSurfer on ${config.baseUrl}  (dry-run: ${config.dryRun})`);
  log.info(`Dashboard: ${config.baseUrl}/surfing`);
});
