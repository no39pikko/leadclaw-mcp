import { z } from "zod/v3";
import { requireAuth, authErrorResponse } from "../auth.js";
import { connectUrl as metaConnectUrl, getMetaConnection, metaConfigured } from "../integrations/metaOAuth.js";
import { connectUrl as googleConnectUrl, getGoogleConnection, googleAdsConfigured } from "../integrations/googleAdsOAuth.js";
import { text } from "./gtm_shared.js";

// ---- connect_ad_account ----

export const connectAdAccountShape = {
  platform: z
    .enum(["meta", "google"])
    .optional()
    .describe("Which ad platform to connect: 'meta' (Facebook/Instagram) or 'google' (Google Ads). Default: meta."),
};

export async function connectAdAccountHandler(args: { platform?: "meta" | "google" }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const platform = args.platform ?? "meta";

  if (platform === "google") {
    if (!googleAdsConfigured()) {
      return text(
        "Google Ads connection isn't enabled on this server yet (admin: set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN)."
      );
    }
    const url = googleConnectUrl(auth.api_key);
    const connected = !!getGoogleConnection(auth.api_key)?.refresh_token;
    const msg = connected
      ? `Your Google Ads account is already connected. To reconnect, open:\n${url}`
      : `To connect your Google Ads account, open this link and authorize:\n${url}\n\nCampaigns run on your own Google Ads account — Google bills you directly for ad spend; we only orchestrate. Then you can launch_campaign.`;
    return { structuredContent: { platform, connect_url: url, connected }, content: [{ type: "text" as const, text: msg }] };
  }

  if (!metaConfigured()) {
    return text(
      "Meta connection isn't enabled on this server yet (admin: set META_APP_ID / META_APP_SECRET; or META_ACCESS_TOKEN for single-tenant)."
    );
  }
  const url = metaConnectUrl(auth.api_key);
  const connected = !!getMetaConnection(auth.api_key);
  const msg = connected
    ? `Your Meta ad account is already connected. To reconnect, open:\n${url}`
    : `To connect your Meta ad account, open this link and authorize:\n${url}\n\nCampaigns run on your own ad account — Meta bills you directly for ad spend. Then you can launch_campaign.`;
  return { structuredContent: { platform, connect_url: url, connected }, content: [{ type: "text" as const, text: msg }] };
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

  const meta = getMetaConnection(auth.api_key);
  const metaEnv = !!process.env.META_ACCESS_TOKEN;
  const google = getGoogleConnection(auth.api_key);

  const lines = [
    `Meta: ${meta ? "connected (your account)" : metaEnv ? "using server token (dogfood)" : "not connected"}`,
    `Google Ads: ${google?.refresh_token ? `connected${google.customer_id ? ` (customer ${google.customer_id})` : ""}` : "not connected"}`,
  ];

  return {
    structuredContent: { meta_connected: !!meta || metaEnv, google_connected: !!google?.refresh_token },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
