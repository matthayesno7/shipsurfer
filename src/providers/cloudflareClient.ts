import { config } from "../config";
import { log } from "../logger";

/*
 * Cloudflare provider client (Registrar API + DNS) — RESELLER model.
 * This uses SHIPYARD's own Cloudflare account (config.cloudflare.*), not the
 * user's. Shipyard buys the domain on the user's behalf and points it at the
 * user's Railway app. The Registrar API is part of the standard Cloudflare API
 * (no beta gate), but the account needs a billing profile + default registrant
 * contact configured.
 */

export interface DnsRecord {
  type: string; // CNAME | TXT | A …
  name: string; // fully-qualified record name
  value: string; // target / verification value
}

function cf() {
  const token = config.cloudflare.apiToken;
  if (!token) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is not set in .env — required to set up domains/subdomains."
    );
  }
  return {
    token,
    account: config.cloudflare.accountId,
    base: "https://api.cloudflare.com/client/v4",
  };
}

export async function checkAvailability(domain: string): Promise<{
  available: boolean;
  price: string;
}> {
  if (config.dryRun) {
    log.ok(`[dry-run] checked availability of ${domain} → available`);
    return { available: true, price: "$10.44/yr" };
  }
  const { token, account, base } = cf();
  const res = await fetch(`${base}/accounts/${account}/registrar/domain-check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ domains: [domain] }),
  });
  const data = (await res.json()) as {
    result?: {
      domains?: {
        name: string;
        registrable: boolean;
        reason?: string;
        pricing?: { currency: string; registration_cost: string };
      }[];
    };
    errors?: unknown[];
  };
  if (!res.ok) {
    throw new Error(
      `Cloudflare availability check failed (HTTP ${res.status}): ${JSON.stringify(data.errors || data).slice(0, 200)}`
    );
  }
  const d = data.result?.domains?.[0];
  if (!d) return { available: false, price: "n/a" };
  // registrable === true means it can be bought via the API (pricing present).
  const available = d.registrable === true;
  const price = d.pricing
    ? `${d.pricing.currency === "USD" ? "$" : d.pricing.currency + " "}${d.pricing.registration_cost}/yr`
    : "n/a";
  return { available, price };
}

/**
 * Is a ShipSurfer subdomain still free? Checks whether any DNS record already
 * exists for `<label>.shipsurfer.app` in ShipSurfer's zone (i.e. another user
 * already claimed it).
 */
export async function subdomainAvailable(label: string): Promise<boolean> {
  const host = `${label}.${config.cloudflare.shipsurferDomain}`;
  if (config.dryRun) return label.toLowerCase() !== "taken";
  const { token, base } = cf();
  const zoneId = await getZoneId(config.cloudflare.shipsurferDomain);
  const res = await fetch(
    `${base}/zones/${zoneId}/dns_records?name=${encodeURIComponent(host)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = (await res.json()) as { result?: unknown[] };
  return !(data.result && data.result.length > 0);
}

/** Register (buy) the domain in Shipyard's Cloudflare account. */
export async function registerDomain(domain: string): Promise<{ pricePaid?: string }> {
  if (config.dryRun) {
    log.ok(`[dry-run] would register ${domain} (billed to Shipyard's CF account)`);
    return { pricePaid: "$10.44/yr" };
  }
  const { token, account, base } = cf();
  // POST /registrations. Only domain_name is required — registrant defaults to
  // the account's address book entry (must be configured + agreement accepted in
  // the CF dashboard). Billable + non-refundable.
  // TODO (pre-launch): pass `contacts.registrant` with the USER's details so
  // they legally own the domain.
  const res = await fetch(`${base}/accounts/${account}/registrar/registrations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ domain_name: domain, privacy_mode: "redaction", years: 1 }),
  });
  const data = (await res.json()) as {
    result?: { state?: string; error?: { message?: string } };
    errors?: unknown[];
  };
  if (!res.ok) {
    throw new Error(`Domain register failed (HTTP ${res.status}): ${JSON.stringify(data.errors || data).slice(0, 200)}`);
  }
  if (data.result?.state === "failed") {
    throw new Error(`Domain registration failed: ${data.result.error?.message || "unknown"}`);
  }
  log.ok(`registered ${domain} (state: ${data.result?.state || "ok"})`);
  return {};
}

/**
 * Create the DNS records Railway requires (CNAME + TXT) in a given Cloudflare
 * zone. `zoneName` is the registrable zone: the bought domain (Tier 2) or
 * ShipSurfer's own domain like shipsurfer.app (Tier 1 subdomains).
 */
export async function pointDns(
  zoneName: string,
  records: DnsRecord[],
  proxied = false
): Promise<void> {
  if (config.dryRun) {
    for (const r of records)
      log.ok(`[dry-run] would add ${r.type}  ${r.name} → ${r.value}${proxied ? " (proxied)" : ""}`);
    log.ok(`[dry-run] would provision TLS certificate`);
    return;
  }
  const { token, base } = cf();
  const zoneId = await getZoneId(zoneName);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  for (const r of records) {
    // Only CNAME/A can be proxied; TXT is always DNS-only.
    const wantProxied = proxied && (r.type === "CNAME" || r.type === "A");
    const body = { type: r.type, name: r.name, content: r.value, proxied: wantProxied, ttl: 1 };

    // Upsert: update an existing record of the same name+type, else create.
    const findRes = await fetch(
      `${base}/zones/${zoneId}/dns_records?type=${r.type}&name=${encodeURIComponent(r.name)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const found = (await findRes.json()) as { result?: { id: string }[] };
    const existingId = found.result?.[0]?.id;

    const res = existingId
      ? await fetch(`${base}/zones/${zoneId}/dns_records/${existingId}`, {
          method: "PUT",
          headers: auth,
          body: JSON.stringify(body),
        })
      : await fetch(`${base}/zones/${zoneId}/dns_records`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        });
    if (!res.ok) throw new Error(`DNS record (${r.type} ${r.name}) failed: ${await res.text()}`);
    log.ok(
      `${existingId ? "updated" : "added"} ${r.type} ${r.name} → ${r.value}${wantProxied ? " (proxied — Cloudflare TLS)" : ""}`
    );
  }
}

async function getZoneId(zoneName: string): Promise<string> {
  const { token, base } = cf();
  const res = await fetch(`${base}/zones?name=${zoneName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    result?: { id: string }[];
    errors?: unknown[];
  };
  if (!res.ok) {
    throw new Error(
      `Cloudflare zone lookup failed (HTTP ${res.status}): ${JSON.stringify(data.errors || data).slice(0, 200)}`
    );
  }
  const id = data.result?.[0]?.id;
  if (!id) {
    throw new Error(
      `No Cloudflare zone found for ${zoneName}. Check it's added as a zone in this Cloudflare account AND that the API token has Zone:Read permission.`
    );
  }
  return id;
}
