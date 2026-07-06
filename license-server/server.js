/*
 * Shipyard license server — the ONLY hosted component.
 * It never touches a user's GitHub/Supabase/Railway tokens (those stay on the
 * user's machine). It only: takes payment, issues a license key, validates keys.
 *
 *   POST /checkout         → create a Stripe Checkout Session ($99 one-time)
 *   POST /webhook          → Stripe calls this on payment; we mint + store a key
 *   POST /validate         → the local CLI calls this on launch to check a key
 *   GET  /health           → liveness
 *
 * Store: flat JSON (.licenses.json). Swap for a real DB in production.
 */
require("dotenv").config(); // load .env before reading any process.env values
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const PORT = process.env.PORT || 8787;
const SIMULATE = (process.env.SIMULATE || "true").toLowerCase() === "true";
// FREE_BETA: mint real, validatable keys at no charge (production-safe beta).
// Unlike SIMULATE (a local dev flag), this is meant to run in production while
// the tool is free for testers. Flip to false + wire Stripe to start charging.
const FREE_BETA = (process.env.FREE_BETA || "false").toLowerCase() === "true";
// Persist keys on a mounted volume so a redeploy doesn't wipe issued licenses.
// Railway auto-sets RAILWAY_VOLUME_MOUNT_PATH when a volume is attached, so we
// use it automatically — no manual LICENSE_STORE needed.
const STORE =
  process.env.LICENSE_STORE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "licenses.json")
    : path.join(__dirname, ".licenses.json"));
console.log(`[license] store: ${STORE}`);

// Beta signups store (same volume so they persist across redeploys).
const SIGNUPS =
  process.env.SIGNUPS_STORE ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signups.json")
    : path.join(__dirname, ".signups.json"));
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "matthayesno7@gmail.com";
// The server's own public base URL — used to build Stripe success/cancel links
// back to our own pages. Set to your real domain in production.
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

const stripe = process.env.STRIPE_SECRET_KEY
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

/* ── tiny store ─────────────────────────────────────────────────────────── */
const read = () => (fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : {});
const write = (d) => fs.writeFileSync(STORE, JSON.stringify(d, null, 2));

// Find a key already issued for a given Stripe session (idempotency).
function keyForSession(sessionId) {
  if (!sessionId) return null;
  const db = read();
  const hit = Object.entries(db).find(([, v]) => v.sessionId === sessionId);
  return hit ? hit[0] : null;
}

function mintKey(email, source, sessionId) {
  // Never mint twice for the same paid session.
  const existing = keyForSession(sessionId);
  if (existing) return existing;
  const rand = crypto.randomBytes(9).toString("hex").toUpperCase();
  const key = `SHIPYARD-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 12)}`;
  const db = read();
  db[key] = {
    email: email || null, active: true, plan: "lifetime", source,
    sessionId: sessionId || null, createdAt: new Date().toISOString(),
  };
  write(db);
  console.log(`[license] minted ${key} for ${email || "unknown"} (${source})`);
  return key;
}

const app = express();

/* Stripe webhook needs the RAW body, so mount it before express.json(). */
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = JSON.parse(req.body.toString()); // simulate mode
    }
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const key = mintKey(s.customer_details?.email || s.customer_email, "stripe", s.id);
    // In production: email the key to the customer here.
    console.log(`[license] payment complete → ${key}`);
  }
  res.json({ received: true });
});

app.use(express.json());

// OAuth broker: does the code→token exchange server-side so the client secrets
// never live on a user's machine. (See oauth-broker.js.)
const { brokerRouter } = require("./oauth-broker");
app.use(brokerRouter());

// Cloudflare broker: subdomains + domain buying via ShipSurfer's own Cloudflare
// token, gated by a valid license. (See cloudflare-broker.js.)
const { cloudflareRouter } = require("./cloudflare-broker");
app.use(cloudflareRouter((key) => {
  const rec = read()[key];
  return !!(rec && rec.active);
}));

app.get("/", (_req, res) => res.redirect("/buy"));
app.get("/buy", (_req, res) => res.sendFile(path.join(__dirname, "buy.html")));
app.get("/success", (_req, res) => res.sendFile(path.join(__dirname, "success.html")));

app.get("/health", (_req, res) =>
  res.json({ ok: true, simulate: SIMULATE, freeBeta: FREE_BETA, stripe: !!stripe }));

/* ── Beta signups ──────────────────────────────────────────────────────────
 * The static marketing site posts emails here. We store them (on the volume)
 * and email a notification if RESEND_API_KEY is set. */
const readSignups = () => (fs.existsSync(SIGNUPS) ? JSON.parse(fs.readFileSync(SIGNUPS, "utf8")) : []);
const writeSignups = (d) => fs.writeFileSync(SIGNUPS, JSON.stringify(d, null, 2));

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}
app.options("/beta-signup", (_req, res) => { cors(res); res.sendStatus(204); });

app.post("/beta-signup", async (req, res) => {
  cors(res);
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "invalid email" });
  const list = readSignups();
  if (!list.some((s) => s.email === email)) {
    list.push({ email, at: new Date().toISOString(), ref: req.get("referer") || null });
    writeSignups(list);
    console.log(`[beta] signup: ${email} (total ${list.length})`);
    // Fire-and-forget email notification via Resend (optional).
    if (process.env.RESEND_API_KEY) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "ShipSurfer <onboarding@resend.dev>",
          to: [NOTIFY_EMAIL],
          subject: `🏄 New ShipSurfer beta signup: ${email}`,
          text: `${email} joined the ShipSurfer beta.\n\nTotal signups: ${list.length}`,
        }),
      })
        .then(async (r) => {
          if (r.ok) console.log(`[beta] email notify sent to ${NOTIFY_EMAIL}`);
          else console.log(`[beta] email notify REJECTED (HTTP ${r.status}): ${await r.text()}`);
        })
        .catch((e) => console.log(`[beta] email notify failed: ${e.message}`));
    } else {
      console.log(`[beta] no RESEND_API_KEY set — skipping email notify`);
    }
  }
  res.json({ ok: true });
});

// Simple protected list to review signups (set ADMIN_TOKEN to enable).
app.get("/beta-signups", (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.query.token !== process.env.ADMIN_TOKEN)
    return res.status(403).json({ error: "forbidden" });
  res.json(readSignups());
});

/* Create a checkout.
 * - FREE_BETA / local SIMULATE: mint a key instantly (no Stripe).
 * - Otherwise: real Stripe Checkout. allow_promotion_codes lets testers enter a
 *   100%-off code; in test mode they can pay with card 4242 4242 4242 4242. */
app.post("/checkout", async (req, res) => {
  const email = req.body?.email;
  if (FREE_BETA) {
    const key = mintKey(email, "free-beta");
    return res.json({ freeBeta: true, key, message: "Free during beta — here's your license key." });
  }
  if (SIMULATE || !stripe) {
    const key = mintKey(email, "simulate");
    return res.json({ simulate: true, key, message: "SIMULATE mode — here's your key (no charge)." });
  }
  try {
    // Optional return URL (the local app's /activate) to bounce the key back to.
    const ret = req.body?.return ? `&return=${encodeURIComponent(req.body.return)}` : "";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      success_url: `${PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}${ret}`,
      cancel_url: `${PUBLIC_URL}/buy`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Called by the success page after Stripe redirects back. Verifies the session
 * was actually paid, then mints (once) and returns the license key. This works
 * even without a webhook configured — handy for testing. */
app.get("/key", async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: "missing session_id" });
  const already = keyForSession(sessionId);
  if (already) return res.json({ key: already });
  if (!stripe) return res.status(400).json({ error: "Stripe not configured" });
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.payment_status !== "paid") return res.json({ pending: true });
    const key = mintKey(s.customer_details?.email || s.customer_email, "stripe", s.id);
    res.json({ key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* The local CLI calls this on every launch (result is cached locally). */
app.post("/validate", (req, res) => {
  const { key } = req.body || {};
  const rec = read()[key];
  if (!rec || !rec.active) return res.json({ valid: false });
  res.json({ valid: true, plan: rec.plan, email: rec.email });
});

app.listen(PORT, () => {
  const mode = FREE_BETA ? "FREE_BETA (no charge)"
    : SIMULATE ? "SIMULATE (no charge)"
    : stripe ? "STRIPE (real checkout)"
    : "NO STRIPE KEY — will mint free keys!";
  console.log(`ShipSurfer license server on :${PORT}  → mode: ${mode}`);
});
