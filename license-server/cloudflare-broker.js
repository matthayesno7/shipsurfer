/*
 * Cloudflare broker — the hosted half of ShipSurfer's domain features.
 *
 * WHY: free *.shipsurfer.app subdomains and buying custom domains both use
 * ShipSurfer's OWN Cloudflare token, which must never sit on a user's machine
 * (it can spend money + manage the shipsurfer.app zone). So the local app calls
 * these endpoints; the token lives only here.
 *
 * EVERY endpoint is gated by a valid license key — only paying users can trigger
 * a domain purchase or claim a subdomain. Registration spends real money, so it's
 * logged.
 *
 *   POST /cf/domain/check     { key, domain }            → { available, price }
 *   POST /cf/subdomain/check  { key, label }             → { available }
 *   POST /cf/domain/register  { key, domain }            → { ok }
 *   POST /cf/dns/point        { key, zoneName, records } → { ok }
 */
const express = require("express");

const BASE = "https://api.cloudflare.com/client/v4";
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const SHIPSURFER_DOMAIN = () => process.env.SHIPSURFER_DOMAIN || "shipsurfer.app";
const H = () => ({ Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" });

async function getZoneId(zoneName) {
  const r = await fetch(`${BASE}/zones?name=${zoneName}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  const d = await r.json();
  const id = d.result?.[0]?.id;
  if (!id) throw new Error(`No Cloudflare zone found for ${zoneName} (is it added to the account + token has Zone:Read?)`);
  return id;
}

async function checkAvailability(domain) {
  const r = await fetch(`${BASE}/accounts/${ACCOUNT()}/registrar/domain-check`, {
    method: "POST", headers: H(), body: JSON.stringify({ domains: [domain] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`availability check failed (HTTP ${r.status})`);
  const dom = d.result?.domains?.[0];
  if (!dom) return { available: false, price: "n/a" };
  const price = dom.pricing
    ? `${dom.pricing.currency === "USD" ? "$" : dom.pricing.currency + " "}${dom.pricing.registration_cost}/yr`
    : "n/a";
  return { available: dom.registrable === true, price };
}

async function subdomainAvailable(label) {
  const host = `${label}.${SHIPSURFER_DOMAIN()}`;
  const zoneId = await getZoneId(SHIPSURFER_DOMAIN());
  const r = await fetch(`${BASE}/zones/${zoneId}/dns_records?name=${encodeURIComponent(host)}`, {
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  const d = await r.json();
  return !(d.result && d.result.length > 0);
}

async function registerDomain(domain) {
  const r = await fetch(`${BASE}/accounts/${ACCOUNT()}/registrar/registrations`, {
    method: "POST", headers: H(),
    body: JSON.stringify({ domain_name: domain, privacy_mode: "redaction", years: 1 }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`domain register failed (HTTP ${r.status})`);
  if (d.result?.state === "failed") throw new Error(`registration failed: ${d.result.error?.message || "unknown"}`);
  return { state: d.result?.state || "ok" };
}

async function pointDns(zoneName, records, proxied) {
  const zoneId = await getZoneId(zoneName);
  for (const rec of records) {
    const wantProxied = !!proxied && (rec.type === "CNAME" || rec.type === "A");
    const body = { type: rec.type, name: rec.name, content: rec.value, proxied: wantProxied, ttl: 1 };
    const findRes = await fetch(
      `${BASE}/zones/${zoneId}/dns_records?type=${rec.type}&name=${encodeURIComponent(rec.name)}`,
      { headers: { Authorization: `Bearer ${TOKEN()}` } }
    );
    const found = await findRes.json();
    const existingId = found.result?.[0]?.id;
    const res = existingId
      ? await fetch(`${BASE}/zones/${zoneId}/dns_records/${existingId}`, { method: "PUT", headers: H(), body: JSON.stringify(body) })
      : await fetch(`${BASE}/zones/${zoneId}/dns_records`, { method: "POST", headers: H(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`DNS record (${rec.type} ${rec.name}) failed: ${(await res.text()).slice(0, 160)}`);
  }
}

/**
 * @param isValidKey (key) => boolean  — supplied by server.js (reads the license store)
 */
function cloudflareRouter(isValidKey) {
  const r = express.Router();

  // Config guard for all CF routes; availability checks stay open (harmless
  // reads so users can search before they hold a license).
  r.use("/cf", (req, res, next) => {
    if (!TOKEN() || !ACCOUNT()) return res.status(503).json({ error: "domain features not configured on the server" });
    next();
  });

  // License gate ONLY for actions that spend money / claim resources.
  const requireLicense = (req, res, next) => {
    const key = (req.body && req.body.key) || req.get("x-license-key");
    if (!key || !isValidKey(key)) return res.status(402).json({ error: "a valid ShipSurfer license is required" });
    next();
  };

  r.post("/cf/domain/check", async (req, res) => {
    try { res.json(await checkAvailability(String(req.body.domain))); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });

  r.post("/cf/subdomain/check", async (req, res) => {
    try { res.json({ available: await subdomainAvailable(String(req.body.label)) }); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });

  r.post("/cf/domain/register", requireLicense, async (req, res) => {
    // KILL SWITCH: registration spends ShipSurfer's money. Off unless explicitly
    // enabled (set DOMAIN_BUYING=true on the server to allow it).
    if (process.env.DOMAIN_BUYING !== "true") {
      console.log(`[cf] BLOCKED domain register attempt: ${String(req.body.domain)} (license ${String(req.body.key).slice(0, 12)}…)`);
      return res.status(403).json({
        error: "Buying domains is invite-only during the beta — the free yourname.shipsurfer.app subdomain works today. Want a custom domain? Email matthayesno7@gmail.com.",
      });
    }
    const domain = String(req.body.domain);
    try {
      const out = await registerDomain(domain);
      console.log(`[cf] registered ${domain} for license ${String(req.body.key).slice(0, 12)}… (state: ${out.state})`);
      res.json({ ok: true, ...out });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  r.post("/cf/dns/point", requireLicense, async (req, res) => {
    try { await pointDns(String(req.body.zoneName), req.body.records || [], !!req.body.proxied); res.json({ ok: true }); }
    catch (e) { res.status(502).json({ error: e.message }); }
  });

  return r;
}

module.exports = { cloudflareRouter };
