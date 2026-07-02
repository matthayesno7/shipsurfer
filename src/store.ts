import * as fs from "fs";
import * as path from "path";
import { encrypt, decrypt } from "./crypto";
import { Connection, Provider, ShipJob, UserRecord } from "./types";

/*
 * File-backed store for v0.1. Tokens are encrypted at rest; jobs are plaintext
 * (they hold no secrets). Swap this module for Postgres in v1 without touching
 * callers — the surface is intentionally small.
 */

const DIR = path.resolve(process.cwd(), ".shipyard");
const USERS = path.join(DIR, "users.json");
const JOBS = path.join(DIR, "jobs.json");
const APPS = path.join(DIR, "apps.json");

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, "{}");
  if (!fs.existsSync(JOBS)) fs.writeFileSync(JOBS, "{}");
  if (!fs.existsSync(APPS)) fs.writeFileSync(APPS, "{}");
}

function readJson<T>(file: string): Record<string, T> {
  ensure();
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file: string, data: unknown) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ── Users & connections ──────────────────────────────────────────────── */

export function getUser(userId: string): UserRecord {
  const users = readJson<UserRecord>(USERS);
  return users[userId] || { id: userId, connections: {} };
}

export function saveConnection(userId: string, conn: Connection) {
  const users = readJson<UserRecord>(USERS);
  const user = users[userId] || { id: userId, connections: {} };
  // Encrypt secret material before persisting.
  user.connections[conn.provider] = {
    ...conn,
    accessToken: encrypt(conn.accessToken),
    refreshToken: conn.refreshToken ? encrypt(conn.refreshToken) : undefined,
  };
  users[userId] = user;
  writeJson(USERS, users);
}

export function getConnection(
  userId: string,
  provider: Provider
): Connection | undefined {
  const user = getUser(userId);
  const stored = user.connections[provider];
  if (!stored) return undefined;
  return {
    ...stored,
    accessToken: decrypt(stored.accessToken),
    refreshToken: stored.refreshToken ? decrypt(stored.refreshToken) : undefined,
  };
}

export function listConnections(userId: string): Provider[] {
  return Object.keys(getUser(userId).connections) as Provider[];
}

/* ── Ship jobs ────────────────────────────────────────────────────────── */

export function saveJob(job: ShipJob) {
  const jobs = readJson<ShipJob>(JOBS);
  jobs[job.id] = job;
  writeJson(JOBS, jobs);
}

export function getJob(id: string): ShipJob | undefined {
  return readJson<ShipJob>(JOBS)[id];
}

export function listJobs(userId: string): ShipJob[] {
  return Object.values(readJson<ShipJob>(JOBS))
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ── Per-app state (so re-deploys reuse the same DB + Railway project) ──── */

export interface RailwayState {
  projectId: string;
  serviceId: string;
  environmentId: string;
  liveUrl: string;
}

export function getAppState(appName: string): {
  supabaseCreds?: any;
  railway?: RailwayState;
} {
  const apps = readJson<any>(APPS);
  const a = apps[appName];
  if (!a) return {};
  return {
    supabaseCreds: a.supabase ? JSON.parse(decrypt(a.supabase)) : undefined,
    railway: a.railway,
  };
}

export function saveAppState(
  appName: string,
  patch: { supabaseCreds?: any; railway?: RailwayState }
) {
  const apps = readJson<any>(APPS);
  const a = apps[appName] || {};
  // DB creds hold secrets → encrypt. Railway ids/url are not secret.
  if (patch.supabaseCreds) a.supabase = encrypt(JSON.stringify(patch.supabaseCreds));
  if (patch.railway) a.railway = patch.railway;
  a.updatedAt = new Date().toISOString();
  apps[appName] = a;
  writeJson(APPS, apps);
}
