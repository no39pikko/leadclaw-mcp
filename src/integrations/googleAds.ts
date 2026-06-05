/**
 * Google Ads — create a deliverable Search campaign that drives clicks to our
 * hosted lead form (/lp/:campaignId), whose submit hits /webhook/lead/:id.
 *
 * Original code over the public Google Ads REST API (v17). The customer's own
 * Google Ads account is billed by Google directly for the spend; we only
 * orchestrate via their OAuth token + our developer token.
 *
 * NOTE: live-ready but UNTESTED against the live API. Verify resource shapes
 * against the current Google Ads API version before first live use.
 */
import { baseUrl } from "./metaOAuth.js";
import type { Campaign } from "../gtm/types.js";

// Google sunsets API versions ~yearly; keep this current (override via env).
const ADS = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v20"}`;

function headers(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    h["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  }
  return h;
}

async function mutate(
  customerId: string,
  accessToken: string,
  resource: string,
  operations: unknown[]
): Promise<string> {
  const res = await fetch(`${ADS}/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({ operations }),
  });
  const data = (await res.json()) as { results?: { resourceName: string }[]; error?: { message: string } };
  if (!res.ok || !data.results?.[0]?.resourceName) {
    throw new Error(`Google Ads ${resource} mutate failed: ${data.error?.message ?? res.status}`);
  }
  return data.results[0].resourceName;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface GoogleLaunchInput {
  accessToken: string;
  customerId: string;
  campaign: Campaign;
}

export async function launchSearchCampaign(input: GoogleLaunchInput): Promise<{ adCampaignId: string; status: string }> {
  const { accessToken, customerId, campaign } = input;
  const status = process.env.LAUNCH_PAUSED === "true" ? "PAUSED" : "ENABLED";
  const lpUrl = `${baseUrl()}/lp/${campaign.id}`;
  const creative = campaign.ad_creative;

  // 1. Budget (micros = currency * 1e6).
  const budgetRN = await mutate(customerId, accessToken, "campaignBudgets", [
    {
      create: {
        name: `GTM ${campaign.id} budget`,
        amountMicros: String(Math.round(campaign.daily_budget * 1_000_000)),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  ]);

  // 2. Campaign (Search, manual CPC, paused at the campaign level for safety).
  const campaignRN = await mutate(customerId, accessToken, "campaigns", [
    {
      create: {
        name: `GTM ${campaign.id}`,
        advertisingChannelType: "SEARCH",
        status: "PAUSED",
        campaignBudget: budgetRN,
        manualCpc: { enhancedCpcEnabled: true },
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
      },
    },
  ]);

  // 3. Ad group.
  const adGroupRN = await mutate(customerId, accessToken, "adGroups", [
    {
      create: {
        name: `GTM ${campaign.id} group`,
        campaign: campaignRN,
        status: "ENABLED",
        type: "SEARCH_STANDARD",
        cpcBidMicros: "2000000", // $2 default max CPC; adjust later
      },
    },
  ]);

  // 4. Responsive Search Ad → our landing page.
  const headlineSrc = [creative?.headline || campaign.offer, campaign.offer, "Get a call in minutes", "Talk to us today"];
  const descSrc = [
    creative?.body || `${campaign.offer}. Leave your number and we'll call you fast.`,
    "Tell us what you need — we'll call you within minutes.",
  ];
  await mutate(customerId, accessToken, "adGroupAds", [
    {
      create: {
        adGroup: adGroupRN,
        status: "ENABLED",
        ad: {
          finalUrls: [lpUrl],
          responsiveSearchAd: {
            headlines: headlineSrc.slice(0, 4).map((t) => ({ text: cut(t, 30) })),
            descriptions: descSrc.slice(0, 2).map((t) => ({ text: cut(t, 90) })),
          },
        },
      },
    },
  ]);

  // 5. Keywords (phrase match) from explicit keywords or derived from the offer.
  const kw =
    campaign.ad_targeting.keywords && campaign.ad_targeting.keywords.length
      ? campaign.ad_targeting.keywords
      : [campaign.offer].filter(Boolean);
  if (kw.length) {
    await mutate(
      customerId,
      accessToken,
      "adGroupCriteria",
      kw.slice(0, 20).map((text) => ({
        create: { adGroup: adGroupRN, status: "ENABLED", keyword: { text: cut(text, 80), matchType: "PHRASE" } },
      }))
    );
  }

  return { adCampaignId: campaignRN, status };
}

/** Find the budget resource attached to a campaign (for adjustBudget). */
export async function getCampaignBudgetResource(
  customerId: string,
  accessToken: string,
  campaignResourceName: string
): Promise<string | null> {
  const res = await fetch(`${ADS}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({
      query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`,
    }),
  });
  const data = (await res.json()) as { results?: { campaign?: { campaignBudget?: string } }[] };
  return data.results?.[0]?.campaign?.campaignBudget ?? null;
}

export async function setCampaignStatus(
  customerId: string,
  accessToken: string,
  campaignResourceName: string,
  newStatus: "ENABLED" | "PAUSED"
): Promise<void> {
  await mutate(customerId, accessToken, "campaigns", [
    { update: { resourceName: campaignResourceName, status: newStatus }, updateMask: "status" },
  ]);
}

export async function setBudget(
  customerId: string,
  accessToken: string,
  budgetResourceName: string,
  dailyBudget: number
): Promise<void> {
  await mutate(customerId, accessToken, "campaignBudgets", [
    {
      update: { resourceName: budgetResourceName, amountMicros: String(Math.round(dailyBudget * 1_000_000)) },
      updateMask: "amount_micros",
    },
  ]);
}
