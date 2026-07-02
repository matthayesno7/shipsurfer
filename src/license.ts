import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/*
 * Client-side license gate. Runs on every `npx shipyard` launch.
 * The key lives at ~/.shipyard/license.json. We validate it against the license
 * server, and cache the result so the tool keeps working offline for a grace
 * period. The license server NEVER sees the user's cloud tokens — only the key.
 */

// One hosted license service serves both /validate and the /buy page.
const LICENSE_URL =
  process.env.SHIPYARD_LICENSE_URL || "https://api.shipsurfer.app";
export const BUY_URL =
  process.env.SHIPYARD_BUY_URL || "https://api.shipsurfer.app/buy";

const GRACE_DAYS = 7;

function file(): string {
  return path.join(os.homedir(), ".shipyard", "license.json");
}

export function saveKey(key: string) {
  const dir = path.dirname(file());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify({ key, lastValidated: null }, null, 2));
}

function load(): { key: string; lastValidated: string | null } | null {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return null;
  }
}

export interface LicenseResult {
  licensed: boolean;
  email?: string;
  reason?: "missing" | "invalid" | "offline-expired";
}

export async function ensureLicensed(): Promise<LicenseResult> {
  // Allow CI/dev to bypass with an env flag (handy for your own testing).
  if (process.env.SHIPYARD_LICENSE_KEY === "dev") return { licensed: true };

  const rec = load();
  if (!rec?.key) return { licensed: false, reason: "missing" };

  try {
    const res = await fetch(`${LICENSE_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: rec.key }),
    });
    const data = (await res.json()) as { valid: boolean; email?: string };
    if (data.valid) {
      rec.lastValidated = new Date().toISOString();
      fs.writeFileSync(file(), JSON.stringify(rec, null, 2));
      return { licensed: true, email: data.email };
    }
    return { licensed: false, reason: "invalid" };
  } catch {
    // Offline: honour the grace window since the last successful check.
    if (rec.lastValidated) {
      const ageDays =
        (Date.now() - new Date(rec.lastValidated).getTime()) / 86400000;
      if (ageDays <= GRACE_DAYS) return { licensed: true };
    }
    return { licensed: false, reason: "offline-expired" };
  }
}

/** Pretty CLI message when unlicensed. */
export function unlicensedMessage(r: LicenseResult): string {
  const head =
    r.reason === "missing"
      ? "No ShipSurfer license found."
      : r.reason === "offline-expired"
      ? "Couldn't validate your license (offline too long)."
      : "That license key isn't valid or has been deactivated.";
  return (
    `\n⚓ ${head}\n\n` +
    `  Buy a lifetime license ($99):  ${BUY_URL}\n` +
    `  Already bought?  shipyard activate <YOUR-KEY>\n`
  );
}
