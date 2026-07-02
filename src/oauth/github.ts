import { config } from "../config";
import { refreshViaBroker } from "../broker";

/*
 * GitHub OAuth (user-to-server) flow.
 * We use the GitHub App's OAuth credentials so the same App identity that
 * can be installed for repo access also gets a user token (needed to create
 * repos on personal accounts).
 */

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: `${config.baseUrl}/connect/github/callback`,
    state,
    // Repo scope lets us create and push to repositories.
    scope: "repo read:user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
}> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
      redirect_uri: `${config.baseUrl}/connect/github/callback`,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(data.error_description || "GitHub token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scopes: (data.scope || "").split(",").filter(Boolean),
  };
}

/** Refresh via the hosted broker (the client secret stays server-side). */
export async function refresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  return refreshViaBroker("github", refreshToken);
}

export async function getLogin(accessToken: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "shipyard",
      Accept: "application/vnd.github+json",
    },
  });
  const data = (await res.json()) as { login?: string };
  return data.login || "unknown";
}
