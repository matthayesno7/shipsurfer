import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

/*
 * Local encryption key for the token store. Testers don't set this — if it's
 * absent we generate one and persist it to ~/.shipsurfer/secret so it stays
 * stable across restarts (needed to decrypt stored tokens).
 */
function getOrCreateSecret(): string {
  if (process.env.SHIPYARD_SECRET) return process.env.SHIPYARD_SECRET;
  const dir = path.join(os.homedir(), ".shipsurfer");
  const file = path.join(dir, "secret");
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    fs.mkdirSync(dir, { recursive: true });
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  } catch {
    // Last resort: ephemeral (tokens won't survive a restart, but nothing breaks).
    return crypto.randomBytes(32).toString("hex");
  }
}

function readPrivateKey(): string | undefined {
  if (process.env.GITHUB_PRIVATE_KEY) {
    // Allow single-line keys with literal \n.
    return process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  if (process.env.GITHUB_PRIVATE_KEY_PATH) {
    try {
      return fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  baseUrl: process.env.BASE_URL || "http://localhost:4000",
  secret: getOrCreateSecret(),
  dryRun: (process.env.DRY_RUN || "true").toLowerCase() === "true",

  // Hosted OAuth broker. It holds the provider client secrets so this local app
  // never has to. Connect + token refresh route through it.
  brokerUrl: (process.env.SHIPSURFER_BROKER_URL || "https://api.shipsurfer.app").replace(/\/$/, ""),

  github: {
    appId: process.env.GITHUB_APP_ID || "",
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    privateKey: readPrivateKey(),
  },

  railway: {
    clientId: process.env.RAILWAY_CLIENT_ID || "",
    clientSecret: process.env.RAILWAY_CLIENT_SECRET || "",
    // Railway's GraphQL endpoint and OAuth endpoints.
    graphqlUrl: "https://backboard.railway.com/graphql/v2",
    authorizeUrl: "https://backboard.railway.com/oauth/auth",
    tokenUrl: "https://backboard.railway.com/oauth/token",
  },

  supabase: {
    clientId: process.env.SUPABASE_CLIENT_ID || "",
    clientSecret: process.env.SUPABASE_CLIENT_SECRET || "",
    authorizeUrl: "https://api.supabase.com/v1/oauth/authorize",
    tokenUrl: "https://api.supabase.com/v1/oauth/token",
  },

  cloudflare: {
    // Cloudflare Registrar API uses an API token + account id (beta).
    // .trim() guards against a stray newline/space pasted into .env, which
    // Cloudflare rejects as "Invalid format for Authorization header".
    apiToken: (process.env.CLOUDFLARE_API_TOKEN || "").trim(),
    accountId: (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim(),
    // ShipSurfer's own zone for free branded subdomains (Tier 1). Must be a
    // domain registered in / managed by ShipSurfer's Cloudflare account.
    shipsurferDomain: process.env.SHIPSURFER_DOMAIN || "shipsurfer.app",
  },
} as const;

export function assertConfigured(): string[] {
  // The hosted broker holds all provider client secrets, so the local app needs
  // none of them. The encryption key is auto-generated. Nothing is required.
  return [];
}
