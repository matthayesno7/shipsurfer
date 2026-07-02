import { config } from "./config";

/*
 * Client side of the hosted OAuth broker. The broker (api.shipsurfer.app) holds
 * ShipSurfer's provider client secrets and does the code→token exchange, so this
 * local app never needs them. See license-server/oauth-broker.js for the server.
 */

export type BrokerProvider = "github" | "railway" | "supabase";

/** Where the browser should be sent to begin connecting a provider. */
export function startUrl(provider: BrokerProvider): string {
  const ret = `http://localhost:${config.port}/connect/${provider}/return`;
  return `${config.brokerUrl}/oauth/${provider}/start?return=${encodeURIComponent(ret)}`;
}

export interface BrokerTokens {
  accessToken: string;
  refreshToken?: string;
  scopes?: string[];
}

/** Trade a one-time handoff code (returned to our localhost) for the tokens. */
export async function exchangeHandoff(handoff: string): Promise<BrokerTokens> {
  const res = await fetch(`${config.brokerUrl}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff }),
  });
  const data = (await res.json()) as BrokerTokens & { error?: string };
  if (!res.ok || !data.accessToken) throw new Error(data.error || "handoff exchange failed");
  return data;
}

/** Refresh an access token through the broker (the secret stays server-side). */
export async function refreshViaBroker(
  provider: BrokerProvider,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await fetch(`${config.brokerUrl}/oauth/${provider}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json()) as { accessToken?: string; refreshToken?: string; error?: string };
  if (!res.ok || !data.accessToken) throw new Error(data.error || `${provider} token refresh failed`);
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}
