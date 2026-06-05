/**
 * GoogleAdsDriver — runs Search ads on the CUSTOMER's own Google Ads account
 * (via their OAuth token); Google bills the customer directly for spend. Same
 * AdDriver interface as Meta. Ads drive clicks to our hosted /lp/:campaignId,
 * whose form POSTs to /webhook/lead/:campaignId.
 */
import type { AdDriver } from "./types.js";
import type { Campaign, ParsedLead } from "../gtm/types.js";
import { getAccessToken } from "../integrations/googleAdsOAuth.js";
import {
  launchSearchCampaign,
  setBudget,
  setCampaignStatus,
  getCampaignBudgetResource,
} from "../integrations/googleAds.js";

export class GoogleAdsDriver implements AdDriver {
  readonly name = "google-ads";

  async launchCampaign(c: Campaign) {
    const { accessToken, customerId } = await getAccessToken(c.account_id);
    if (!customerId) throw new Error("No Google Ads customer id for this account — reconnect via connect_ad_account.");
    return launchSearchCampaign({ accessToken, customerId, campaign: c });
  }

  async pauseCampaign(c: Campaign) {
    if (!c.ad_campaign_id) return;
    const { accessToken, customerId } = await getAccessToken(c.account_id);
    if (!customerId) return;
    await setCampaignStatus(customerId, accessToken, c.ad_campaign_id, "PAUSED");
  }

  async adjustBudget(c: Campaign, dailyBudget: number) {
    if (!c.ad_campaign_id) return;
    const { accessToken, customerId } = await getAccessToken(c.account_id);
    if (!customerId) return;
    const budgetRN = await getCampaignBudgetResource(customerId, accessToken, c.ad_campaign_id);
    if (budgetRN) await setBudget(customerId, accessToken, budgetRN, dailyBudget);
  }

  async parseLeadWebhook(payload: unknown, _campaign?: Campaign): Promise<ParsedLead | null> {
    // Google sends traffic to our hosted LP, which POSTs a flat JSON body.
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (!p.email && !p.phone) return null;
    const consent = p.consent === true || p.consent === "true" || p.consent === "on" || p.consent === 1;
    return {
      name: typeof p.name === "string" ? p.name : undefined,
      email: typeof p.email === "string" ? p.email : undefined,
      phone: typeof p.phone === "string" ? p.phone : undefined,
      company: typeof p.company === "string" ? p.company : undefined,
      title: typeof p.title === "string" ? p.title : undefined,
      consent,
      raw: payload,
    };
  }
}
