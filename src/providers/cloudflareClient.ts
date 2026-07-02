import { config } from "../config";
import { log } from "../logger";
import { getKey } from "../license";

/*
 * Cloudflare provider client — now a thin wrapper over the hosted ShipSurfer
 * broker (api.shipsurfer.app/cf/*). ShipSurfer's Cloudflare token lives ONLY on
 * the server, so nothing here needs it. The broker buys domains + manages the
 * shipsurfer.app zone on the user's behalf, gated by their license key.
 * In dry-run we still simulate locally so the pipeline runs with no network.
 */

export interface DnsRecord {
  type: string; // CNAME | TXT | A …
  name: string; // fully-qualified record name
  value: string; // target / verification value
}

async function broker<T>(
  path: string,
  body: Record<string, unknown>,
  requireKey = true
): Promise<T> {
  const key = getKey();
  if (requireKey && !key) throw new Error("A ShipSurfer license is required for domain features.");
  const res = await fetch(`${config.brokerUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: key || undefined, ...body }),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error || `broker ${path} failed (HTTP ${res.status})`);
  return data;
}

export async function checkAvailability(domain: string): Promise<{
  available: boolean;
  price: string;
}> {
  if (config.dryRun) {
    log.ok(`[dry-run] checked availability of ${domain} → available`);
    return { available: true, price: "$10.44/yr" };
  }
  return broker("/cf/domain/check", { domain }, false);
}

/** Is `<label>.shipsurfer.app` still free? */
export async function subdomainAvailable(label: string): Promise<boolean> {
  if (config.dryRun) return label.toLowerCase() !== "taken";
  const { available } = await broker<{ available: boolean }>("/cf/subdomain/check", { label }, false);
  return available;
}

/** Register (buy) the domain via the broker (billed to ShipSurfer's CF account). */
export async function registerDomain(domain: string): Promise<{ pricePaid?: string }> {
  if (config.dryRun) {
    log.ok(`[dry-run] would register ${domain} (billed to ShipSurfer's CF account)`);
    return { pricePaid: "$10.44/yr" };
  }
  await broker("/cf/domain/register", { domain });
  log.ok(`registered ${domain}`);
  return {};
}

/**
 * Create Railway's required DNS records (CNAME + TXT) in a Cloudflare zone:
 * the bought domain (Tier 2) or shipsurfer.app (Tier 1 subdomains).
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
  await broker("/cf/dns/point", { zoneName, records, proxied });
  for (const r of records) log.ok(`added ${r.type} ${r.name} → ${r.value}`);
}
