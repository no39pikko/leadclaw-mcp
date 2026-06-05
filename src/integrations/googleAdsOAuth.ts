/**
 * Google Ads OAuth (per-customer). Each customer connects their OWN Google Ads
 * account; ad spend is billed by Google directly to their card. We only
 * orchestrate. Reuses the GOOGLE_CLIENT_ID/SECRET OAuth client (add the web
 * redirect URI) with the `adwords` scope. Tokens stored per account in
 * ad_accounts(platform='google'); access tokens are refreshed on demand.
 */
import { getAdAccount, upsertAdAccount } from "../gtm/db.js";
import { baseUrl } from "./metaOAuth.js";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const ADS = "https://googleads.googleapis.com/v17";

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  customer_id?: string; // the customer's Google Ads account id (digits only)
  obtained_at: number;
}

export function googleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );
}

function redirectUri(): string {
  return `${baseUrl()}/connect/google/callback`;
}

export function connectUrl(apiKey: string): string {
  return `${baseUrl()}/connect/google?api_key=${encodeURIComponent(apiKey)}`;
}

export function buildAuthUrl(apiKey: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: apiKey,
  });
  return `${AUTH}?${p.toString()}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const p = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600 };
}

/** First accessible Google Ads customer id (digits only), used as the operating account. */
export async function fetchCustomerId(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${ADS}/customers:listAccessibleCustomers`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      },
    });
    const data = (await res.json()) as { resourceNames?: string[] };
    const rn = data.resourceNames?.[0]; // "customers/1234567890"
    return rn?.split("/")[1];
  } catch {
    return undefined;
  }
}

export function storeGoogleConnection(apiKey: string, tokens: GoogleTokens): void {
  upsertAdAccount({
    account_id: apiKey,
    platform: "google",
    oauth_tokens: JSON.stringify(tokens),
    managed_by_us: false,
  });
}

export function getGoogleConnection(apiKey: string): GoogleTokens | null {
  const acct = getAdAccount(apiKey, "google");
  if (!acct?.oauth_tokens) return null;
  try {
    return JSON.parse(acct.oauth_tokens) as GoogleTokens;
  } catch {
    return null;
  }
}

export function hasGoogleConnection(apiKey: string): boolean {
  return !!getGoogleConnection(apiKey)?.refresh_token;
}

/** Returns a valid access token, refreshing via the refresh_token when expired. */
export async function getAccessToken(apiKey: string): Promise<{ accessToken: string; customerId?: string }> {
  const conn = getGoogleConnection(apiKey);
  if (!conn) throw new Error("Google Ads account not connected for this account.");
  if (conn.access_token && conn.expires_at > Date.now() + 60_000) {
    return { accessToken: conn.access_token, customerId: conn.customer_id };
  }
  if (!conn.refresh_token) throw new Error("No Google refresh token; reconnect the account.");
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google token refresh failed: ${data.error ?? res.status}`);
  const updated: GoogleTokens = {
    ...conn,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  storeGoogleConnection(apiKey, updated);
  return { accessToken: data.access_token, customerId: conn.customer_id };
}
