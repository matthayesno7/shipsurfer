import { config } from "../config";

/*
 * Railway OAuth 2.0 / OIDC ("Login with Railway").
 * The token can act on the user's Railway resources per the approved scopes.
 */

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.railway.clientId,
    redirect_uri: `${config.baseUrl}/connect/railway/callback`,
    response_type: "code",
    state,
    // Valid Railway scopes. `openid` is required; `email`+`profile` are needed
    // to resolve workspace membership; `workspace:admin` lets us create
    // projects + deploy in the workspace the user selects; `offline_access`
    // (with prompt=consent) returns a refresh token. A bare "workspace" scope
    // is invalid and triggers access_denied.
    scope: "openid email profile workspace:admin offline_access",
    prompt: "consent",
  });
  return `${config.railway.authorizeUrl}?${params.toString()}`;
}

/** Exchange a refresh token for a fresh access token (Railway tokens last 1h). */
export async function refresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const res = await fetch(config.railway.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.railway.clientId,
      client_secret: config.railway.clientSecret,
    }).toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(data.error_description || "Railway token refresh failed");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/** Identify the connected Railway account (email/name) via /oauth/me. */
export async function getIdentity(token: string): Promise<{ email?: string; name?: string }> {
  try {
    const res = await fetch("https://backboard.railway.com/oauth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = (await res.json()) as { email?: string; name?: string };
    return { email: d.email, name: d.name };
  } catch {
    return {};
  }
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const res = await fetch(config.railway.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.railway.clientId,
      client_secret: config.railway.clientSecret,
      redirect_uri: `${config.baseUrl}/connect/railway/callback`,
    }).toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(data.error_description || "Railway token exchange failed");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
