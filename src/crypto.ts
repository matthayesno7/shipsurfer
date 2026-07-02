import * as crypto from "crypto";
import { config } from "./config";

/*
 * AES-256-GCM encryption for tokens at rest.
 * v0.1 uses a single SHIPYARD_SECRET-derived key. In production this becomes a
 * per-tenant key from a KMS (see spec §6). The interface stays the same.
 */

function key(): Buffer {
  if (!config.secret) {
    throw new Error("SHIPYARD_SECRET is not set — cannot encrypt token store");
  }
  // Derive a 32-byte key from the secret deterministically.
  return crypto.createHash("sha256").update(config.secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
