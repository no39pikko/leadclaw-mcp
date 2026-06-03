import { requireAuth, authErrorResponse } from "../auth.js";
import { connectUrl, getMetaConnection, metaConfigured } from "../integrations/metaOAuth.js";

// ---- connect_ad_account ----

export const connectAdAccountShape = {};

export async function connectAdAccountHandler(_args: Record<string, never>) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  if (!metaConfigured()) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            "Ad-account connection isn't enabled on this server yet. " +
            "(Admin: set META_APP_ID and META_APP_SECRET. For single-tenant dogfood, set META_ACCESS_TOKEN instead and skip connecting.)",
        },
      ],
    };
  }

  const url = connectUrl(auth.api_key);
  const connected = !!getMetaConnection(auth.api_key);
  const msg = connected
    ? `Your Meta ad account is already connected. To reconnect a different account, open:\n${url}`
    : `To connect your Meta ad account, open this link and authorize (takes a few seconds):\n${url}\n\nAfter you authorize, your campaigns will run on your own ad account. Then you can launch_campaign.`;

  return {
    structuredContent: { connect_url: url, connected },
    content: [{ type: "text" as const, text: msg }],
  };
}

// ---- get_connection_status ----

export const connectionStatusShape = {};

export async function connectionStatusHandler(_args: Record<string, never>) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const conn = getMetaConnection(auth.api_key);
  const envFallback = !!process.env.META_ACCESS_TOKEN;
  const connected = !!conn || envFallback;
  const lines = [
    `Meta: ${conn ? "connected (your account)" : envFallback ? "using server token (dogfood)" : "not connected"}`,
  ];
  if (conn?.ad_account_id) lines.push(`  ad account: ${conn.ad_account_id}`);
  if (!connected && metaConfigured()) lines.push(`  → connect with connect_ad_account`);

  return {
    structuredContent: { connected, has_oauth: !!conn, env_fallback: envFallback },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
