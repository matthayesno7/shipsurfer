import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

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
  secret: process.env.SHIPYARD_SECRET || "",
  dryRun: (process.env.DRY_RUN || "true").toLowerCase() === "true",

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
  const missing: string[] = [];
  if (!config.secret) missing.push("SHIPYARD_SECRET");
  if (config.dryRun) return missing; // dry-run needs nothing else
  if (!config.github.clientId) missing.push("GITHUB_CLIENT_ID");
  if (!config.github.clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  if (!config.github.appId) missing.push("GITHUB_APP_ID");
  if (!config.github.privateKey) missing.push("GITHUB_PRIVATE_KEY");
  if (!config.railway.clientId) missing.push("RAILWAY_CLIENT_ID");
  if (!config.railway.clientSecret) missing.push("RAILWAY_CLIENT_SECRET");
  return missing;
}
