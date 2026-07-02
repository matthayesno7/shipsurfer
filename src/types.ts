export type Provider = "github" | "railway" | "supabase" | "cloudflare";

export interface Connection {
  provider: Provider;
  accessToken: string;
  refreshToken?: string;
  // GitHub App installation id, captured during the connect flow.
  installationId?: number;
  // Human-readable account label (login / workspace name).
  account?: string;
  scopes?: string[];
  connectedAt: string;
}

export type ShipStatus =
  | "queued"
  | "repo"
  | "database"
  | "deploy"
  | "domain"
  | "verify"
  | "live"
  | "failed";

export interface ShipStep {
  key: "repo" | "database" | "deploy" | "domain" | "verify";
  label: string;
  status: "pending" | "running" | "done" | "failed";
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ShipJob {
  id: string;
  userId: string;
  appName: string;
  // Absolute path to the local project on the user's machine (v0.1 runs the
  // backend locally, so it can push the repo directly). v1 replaces this with
  // an uploaded source bundle.
  localPath: string;
  // Detected stack info from the local CLI.
  stack: {
    framework: string;
    buildCommand?: string;
    startCommand?: string;
    port?: number;
  };
  // Whether to provision a Supabase database for this app.
  provisionDb: boolean;
  // Optional custom domain to register + point (Tier 2 — user buys + owns it).
  domain?: string;
  // Optional free ShipSurfer subdomain label, e.g. "myapp" → myapp.shipsurfer.app
  // (Tier 1 — a DNS record in ShipSurfer's own zone, no purchase).
  subdomain?: string;
  // Source bundle: a git remote we created, or a tarball path (v0.1 uses repo).
  repoUrl?: string;
  liveUrl?: string;
  // Provisioned database reference (no secrets stored on the job).
  dbProjectRef?: string;
  // Registered domain, once bought + pointed.
  registeredDomain?: string;
  status: ShipStatus;
  steps: ShipStep[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  connections: Partial<Record<Provider, Connection>>;
}
