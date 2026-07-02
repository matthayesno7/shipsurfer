import * as crypto from "crypto";
import { config } from "../config";
import { log } from "../logger";

/*
 * Supabase provider client (Management API).
 * Real mode: POST https://api.supabase.com/v1/projects with an OAuth2 token to
 * create a project, then read its DB connection string + API keys.
 *
 * The creds returned here become the single source of truth that gets injected
 * into the Railway deploy env (spec §5.2) — solving the DATABASE_URL sync bug.
 */

export interface DatabaseCreds {
  projectRef: string;
  // Standard env names a Next.js / Node app expects.
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export async function provisionDatabase(opts: {
  token: string;
  projectName: string;
  region?: string;
}): Promise<DatabaseCreds> {
  const region = opts.region || "us-east-1";

  if (config.dryRun) {
    const ref = "sim" + crypto.randomBytes(8).toString("hex").slice(0, 12);
    const pw = crypto.randomBytes(9).toString("base64url");
    log.ok(`[dry-run] would create Supabase project "${opts.projectName}"`);
    log.ok(`[dry-run] would wait for database to be ready (~1 min real)`);
    log.ok(`[dry-run] captured DATABASE_URL (pooler) + anon/service keys`);
    return {
      projectRef: ref,
      // Session-pooler URL (IPv4) — Railway has no outbound IPv6, so the direct
      // db.<ref>.supabase.co host (IPv6-only) would fail. See Phase 0 findings.
      DATABASE_URL: `postgresql://postgres.${ref}:${pw}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      SUPABASE_URL: `https://${ref}.supabase.co`,
      SUPABASE_ANON_KEY: `sim_anon_${crypto.randomBytes(16).toString("hex")}`,
      SUPABASE_SERVICE_ROLE_KEY: `sim_service_${crypto.randomBytes(16).toString("hex")}`,
    };
  }

  // ── Real mode (v0.2) ──────────────────────────────────────────────────
  // 1. organization_id is REQUIRED by the create endpoint. Use the user's org.
  const orgRes = await fetch("https://api.supabase.com/v1/organizations", {
    headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/json" },
  });
  const orgBody = await orgRes.text();
  if (!orgRes.ok) {
    throw new Error(`Supabase org lookup failed (HTTP ${orgRes.status}): ${orgBody.slice(0, 300)}`);
  }
  let orgs: any;
  try {
    orgs = JSON.parse(orgBody);
  } catch {
    throw new Error(`Supabase org lookup returned non-JSON: ${orgBody.slice(0, 200)}`);
  }
  // Response may be an array, or wrapped (e.g. { organizations: [...] }).
  const orgList = Array.isArray(orgs) ? orgs : orgs?.organizations || orgs?.data || [];
  const organizationId = orgList[0]?.id;
  if (!organizationId) {
    throw new Error(`No Supabase organization found. API returned: ${orgBody.slice(0, 300)}`);
  }

  // 2. Create the project.
  const dbPass = crypto.randomBytes(18).toString("base64url");
  const createRes = await fetch("https://api.supabase.com/v1/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.projectName,
      organization_id: organizationId,
      region,
      db_pass: dbPass,
      // Don't pass desired_instance_size — keeps the free Nano tier.
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Supabase create failed: ${await createRes.text()}`);
  }
  const project = (await createRes.json()) as { id: string; ref: string };
  const ref = project.ref || project.id;

  // 3. Fetch API keys (reveal=true returns the actual key values).
  const keysRes = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${opts.token}`, Accept: "application/json" } }
  );
  const keysBody = await keysRes.text();
  if (!keysRes.ok) {
    throw new Error(`Supabase api-keys failed (HTTP ${keysRes.status}): ${keysBody.slice(0, 300)}`);
  }
  let keysJson: any;
  try {
    keysJson = JSON.parse(keysBody);
  } catch {
    throw new Error(`Supabase api-keys returned non-JSON: ${keysBody.slice(0, 200)}`);
  }
  const keyList: any[] = Array.isArray(keysJson)
    ? keysJson
    : keysJson?.data || keysJson?.api_keys || [];
  const anon = keyList.find((k) => k.name === "anon")?.api_key || "";
  const service = keyList.find((k) => k.name === "service_role")?.api_key || "";

  log.ok(`created Supabase project ${ref}`);
  return {
    projectRef: ref,
    // Session pooler (IPv4, port 5432) so it works from Railway. Username is
    // postgres.<ref> for pooler connections.
    DATABASE_URL: `postgresql://postgres.${ref}:${dbPass}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
    SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  };
}
