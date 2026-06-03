/**
 * Meta (Facebook) OAuth — lets a customer connect their OWN ad account with a
 * click. The MCP `connect_ad_account` tool hands the user a URL; they authorize;
 * we store a per-account token in `ad_accounts`. MetaAdDriver then runs that
 * customer's campaigns on their account.
 *
 * Requires a Meta app (META_APP_ID / META_APP_SECRET) and the server reachable
 * at PUBLIC_URL. Connecting *external* customers also requires Meta App Review
 * of the ads scopes; you (dogfood) can connect immediately as an app test user.
 */
import { getAdAccount, upsertAdAccount } from "../gtm/db.js";

const FB_DIALOG = "https://www.facebook.com/v19.0/dialog/oauth";
const GRAPH = "https://graph.facebook.com/v19.0";
const SCOPES = [
  "ads_management",
  "leads_retrieval",
  "pages_show_list",
  "pages_manage_ads",
  "business_management",
];

export interface MetaTokens {
  access_token: string;
  ad_account_id?: string;
  page_id?: string;
  obtained_at: number;
}

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function baseUrl(): string {
  return process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;
}

function redirectUri(): string {
  return `${baseUrl()}/connect/meta/callback`;
}

/** The stable link we hand the customer; it redirects to Meta's consent dialog. */
export function connectUrl(apiKey: string): string {
  return `${baseUrl()}/connect/meta?api_key=${encodeURIComponent(apiKey)}`;
}

/** The actual Meta consent dialog URL (used by the /connect/meta redirect). */
export function buildAuthUrl(apiKey: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri(),
    state: apiKey,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `${FB_DIALOG}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  const data = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!res.ok || !data.access_token) {
    throw new Error(`Meta token exchange failed: ${data.error?.message ?? res.status}`);
  }
  return data.access_token;
}

/** Best-effort: grab the user's first ad account + page to use as defaults. */
export async function fetchDefaults(accessToken: string): Promise<{ ad_account_id?: string; page_id?: string }> {
  const out: { ad_account_id?: string; page_id?: string } = {};
  try {
    const r = await fetch(`${GRAPH}/me/adaccounts?fields=account_id&access_token=${encodeURIComponent(accessToken)}`);
    const j = (await r.json()) as { data?: { account_id: string }[] };
    out.ad_account_id = j.data?.[0]?.account_id;
  } catch {
    /* leave undefined */
  }
  try {
    const r = await fetch(`${GRAPH}/me/accounts?fields=id&access_token=${encodeURIComponent(accessToken)}`);
    const j = (await r.json()) as { data?: { id: string }[] };
    out.page_id = j.data?.[0]?.id;
  } catch {
    /* leave undefined */
  }
  return out;
}

export function storeMetaConnection(apiKey: string, tokens: MetaTokens): void {
  upsertAdAccount({
    account_id: apiKey,
    platform: "meta",
    oauth_tokens: JSON.stringify(tokens),
    managed_by_us: false,
  });
}

export function getMetaConnection(apiKey: string): MetaTokens | null {
  const acct = getAdAccount(apiKey, "meta");
  if (!acct?.oauth_tokens) return null;
  try {
    return JSON.parse(acct.oauth_tokens) as MetaTokens;
  } catch {
    return null;
  }
}

/** A token is available for this account if it connected via OAuth, or a global
 * env token exists (single-tenant dogfood). */
export function hasMetaToken(apiKey: string): boolean {
  return !!getMetaConnection(apiKey)?.access_token || !!process.env.META_ACCESS_TOKEN;
}
