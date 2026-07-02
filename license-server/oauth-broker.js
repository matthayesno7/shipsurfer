/*
 * OAuth broker — the hosted half of ShipSurfer's "connect once" flow.
 *
 * WHY: the local ShipSurfer app runs on each user's machine. Exchanging an OAuth
 * code for a token requires ShipSurfer's *client secret*, which must never sit on
 * a user's machine. So the local app sends users here; this server (the only place
 * the secrets live) does the code→token exchange and hands the resulting token
 * back to the app on localhost. Tokens are never stored server-side — they're held
 * for at most a couple of minutes to complete the handoff, then dropped.
 *
 * Flow:
 *   local app  →  GET  /oauth/:provider/start?return=<localUrl>&state=<s>
 *              →  provider consent screen
 *              →  GET  /oauth/:provider/callback?code&state   (exchange here)
 *              →  redirect back to <localUrl>?handoff=<code>
 *   local app  →  POST /oauth/exchange { handoff }            → { accessToken, refreshToken }
 *   later      →  POST /oauth/:provider/refresh { refreshToken } → fresh tokens
 *
 * The client secret only ever appears in exchange()/refresh() below.
 */
const crypto = require("crypto");
const express = require("express");

const SELF = () => (process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");
const cb = (provider) => `${SELF()}/oauth/${provider}/callback`;

/* ── Provider definitions (mirror the local app's oauth/*.ts exactly) ─────── */
const PROVIDERS = {
  github: {
    id: () => process.env.GITHUB_CLIENT_ID,
    secret: () => process.env.GITHUB_CLIENT_SECRET,
    authorize(state) {
      return "https://github.com/login/oauth/authorize?" + new URLSearchParams({
        client_id: this.id(), redirect_uri: cb("github"), state, scope: "repo read:user",
      });
    },
    async exchange(code) {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: this.id(), client_secret: this.secret(), code, redirect_uri: cb("github") }),
      });
      return norm(await r.json(), "GitHub");
    },
    async refresh(refresh_token) {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: this.id(), client_secret: this.secret(), grant_type: "refresh_token", refresh_token }),
      });
      return norm(await r.json(), "GitHub");
    },
  },

  railway: {
    id: () => process.env.RAILWAY_CLIENT_ID,
    secret: () => process.env.RAILWAY_CLIENT_SECRET,
    tokenUrl: "https://backboard.railway.com/oauth/token",
    authorize(state) {
      return "https://backboard.railway.com/oauth/auth?" + new URLSearchParams({
        client_id: this.id(), redirect_uri: cb("railway"), response_type: "code", state,
        scope: "openid email profile workspace:admin offline_access", prompt: "consent",
      });
    },
    async exchange(code) {
      const r = await fetch(this.tokenUrl, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: this.id(), client_secret: this.secret(), redirect_uri: cb("railway") }),
      });
      return norm(await r.json(), "Railway");
    },
    async refresh(refresh_token) {
      const r = await fetch(this.tokenUrl, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token, client_id: this.id(), client_secret: this.secret() }),
      });
      return norm(await r.json(), "Railway");
    },
  },

  supabase: {
    id: () => process.env.SUPABASE_CLIENT_ID,
    secret: () => process.env.SUPABASE_CLIENT_SECRET,
    tokenUrl: "https://api.supabase.com/v1/oauth/token",
    basic() { return Buffer.from(`${this.id()}:${this.secret()}`).toString("base64"); },
    authorize(state) {
      return "https://api.supabase.com/v1/oauth/authorize?" + new URLSearchParams({
        client_id: this.id(), redirect_uri: cb("supabase"), response_type: "code", state,
      });
    },
    async exchange(code) {
      const r = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${this.basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb("supabase") }),
      });
      return norm(await r.json(), "Supabase");
    },
    async refresh(refresh_token) {
      const r = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${this.basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
      });
      return norm(await r.json(), "Supabase");
    },
  },
};

function norm(data, label) {
  if (!data || !data.access_token) {
    throw new Error(data?.error_description || data?.message || `${label} token exchange failed`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scopes: (data.scope || "").split(/[ ,]/).filter(Boolean),
  };
}

/* ── Short-lived state + handoff stores (in-memory; single instance) ──────── */
const states = new Map();   // state -> { return, provider, exp }
const handoffs = new Map(); // handoff -> { tokens, exp }
const TTL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of states) if (v.exp < now) states.delete(k);
  for (const [k, v] of handoffs) if (v.exp < now) handoffs.delete(k);
}, 60 * 1000).unref?.();

function isLoopback(url) {
  try { const u = new URL(url); return u.hostname === "localhost" || u.hostname === "127.0.0.1"; }
  catch { return false; }
}

/* ── Router ───────────────────────────────────────────────────────────────── */
function brokerRouter() {
  const r = express.Router();

  // 1) Begin: remember where to send the user back (must be their localhost),
  //    then bounce to the provider's consent screen.
  r.get("/oauth/:provider/start", (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p) return res.status(404).send("unknown provider");
    if (!p.id() || !p.secret()) return res.status(500).send(`${req.params.provider} is not configured on the server`);
    const ret = String(req.query.return || "");
    if (!isLoopback(ret)) return res.status(400).send("return must be a localhost URL");
    const state = crypto.randomBytes(16).toString("hex");
    states.set(state, { return: ret, provider: req.params.provider, exp: Date.now() + TTL_MS });
    res.redirect(p.authorize(state));
  });

  // 2) Provider redirects here. Exchange the code (secret used ONLY here), mint a
  //    one-time handoff code, and send the user back to their local app.
  r.get("/oauth/:provider/callback", async (req, res) => {
    const p = PROVIDERS[req.params.provider];
    const { code, state, error, error_description } = req.query;
    const st = state && states.get(String(state));
    if (!p || !st || st.provider !== req.params.provider) return res.status(400).send("invalid or expired state");
    states.delete(String(state));
    if (error) return bounce(res, st.return, { error: String(error_description || error) });
    try {
      const tokens = await p.exchange(String(code));
      const handoff = crypto.randomBytes(24).toString("hex");
      handoffs.set(handoff, { tokens, exp: Date.now() + TTL_MS });
      bounce(res, st.return, { handoff });
    } catch (e) {
      bounce(res, st.return, { error: e.message });
    }
  });

  // 3) The local app trades its one-time handoff code for the tokens.
  r.post("/oauth/exchange", (req, res) => {
    const { handoff } = req.body || {};
    const rec = handoff && handoffs.get(handoff);
    if (!rec) return res.status(400).json({ error: "invalid or expired handoff" });
    handoffs.delete(handoff);
    res.json(rec.tokens);
  });

  // 4) Ongoing token refresh (secret used server-side).
  r.post("/oauth/:provider/refresh", async (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p) return res.status(404).json({ error: "unknown provider" });
    try {
      res.json(await p.refresh(String((req.body || {}).refreshToken)));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return r;
}

function bounce(res, ret, params) {
  const u = new URL(ret);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  res.redirect(u.toString());
}

module.exports = { brokerRouter };
