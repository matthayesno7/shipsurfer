import { config } from "../config";
import { refreshViaBroker } from "../broker";

/*
 * Supabase OAuth2 (Management API).
 * Lets Shipyard create projects + read keys on behalf of the user's org.
 * Authorize: https://api.supabase.com/v1/oauth/authorize
 * Token:     https://api.supabase.com/v1/oauth/token  (HTTP Basic client auth)
 */

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.supabase.clientId,
    redirect_uri: `${config.baseUrl}/connect/supabase/callback`,
    response_type: "code",
    state,
  });
  return `${config.supabase.authorizeUrl}?${params.toString()}`;
}

/** Refresh via the hosted broker (the client secret stays server-side). */
export async function refresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  return refreshViaBroker("supabase", refreshToken);
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const basic = Buffer.from(
    `${config.supabase.clientId}:${config.supabase.clientSecret}`
  ).toString("base64");

  const res = await fetch(config.supabase.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.baseUrl}/connect/supabase/callback`,
    }).toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
    message?: string;
  };
  if (!data.access_token) {
    throw new Error(
      data.error_description || data.message || "Supabase token exchange failed"
    );
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
