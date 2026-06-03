/**
 * MetaLeadAdsDriver — Meta (Facebook/Instagram) Lead Ads via the Graph API.
 *
 * Multi-tenant: each customer connects their own ad account via OAuth
 * (src/integrations/metaOAuth.ts), and we use that per-account token. Falls back
 * to a global META_ACCESS_TOKEN / META_AD_ACCOUNT_ID for single-tenant dogfood.
 *
 * v1 honesty: launchCampaign creates a PAUSED campaign object; the ad set +
 * creative + ad must be completed (Ads Manager for dogfood, or extended here)
 * before it delivers. Webhook parsing — what Speed-to-Lead depends on — is full.
 */
import type { AdDriver } from "./types.js";
import type { Campaign, ParsedLead } from "../gtm/types.js";
import { getMetaConnection } from "../integrations/metaOAuth.js";

const GRAPH = "https://graph.facebook.com/v19.0";

export class MetaLeadAdsDriver implements AdDriver {
  readonly name = "meta-lead-ads";

  private tokenFor(campaign?: Campaign): string {
    const connected = campaign ? getMetaConnection(campaign.account_id)?.access_token : undefined;
    return connected ?? process.env.META_ACCESS_TOKEN ?? "";
  }

  private adAccountFor(campaign?: Campaign): string {
    const connected = campaign ? getMetaConnection(campaign.account_id)?.ad_account_id : undefined;
    return connected ?? process.env.META_AD_ACCOUNT_ID ?? "";
  }

  async launchCampaign(c: Campaign) {
    const token = this.tokenFor(c);
    const adAccountId = this.adAccountFor(c);
    if (!token) throw new Error("No Meta token for this account — connect via connect_ad_account first.");
    if (!adAccountId) throw new Error("No Meta ad account id available for this account.");

    const res = await fetch(`${GRAPH}/act_${adAccountId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `GTM ${c.id}`,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: [],
        access_token: token,
      }),
    });
    const data = (await res.json()) as { id?: string; error?: { message: string } };
    if (!res.ok || !data.id) {
      throw new Error(`Meta campaign create failed: ${data.error?.message ?? res.status}`);
    }
    return { adCampaignId: data.id, status: "PAUSED" };
  }

  async pauseCampaign(c: Campaign) {
    if (!c.ad_campaign_id) return;
    await fetch(`${GRAPH}/${c.ad_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: this.tokenFor(c) }),
    });
  }

  async adjustBudget(c: Campaign, dailyBudget: number) {
    if (!c.ad_campaign_id) return;
    await fetch(`${GRAPH}/${c.ad_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Meta budgets are in minor units (cents).
      body: JSON.stringify({ daily_budget: Math.round(dailyBudget * 100), access_token: this.tokenFor(c) }),
    });
  }

  async parseLeadWebhook(payload: unknown, campaign?: Campaign): Promise<ParsedLead | null> {
    const token = this.tokenFor(campaign);
    const p = payload as Record<string, any>;

    // Shape 1: raw Meta leadgen webhook — only carries an id; fetch the fields.
    let leadgenId: string | undefined;
    try {
      leadgenId = p?.entry?.[0]?.changes?.[0]?.value?.leadgen_id;
    } catch {
      /* not this shape */
    }

    if (leadgenId) {
      const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(token)}`);
      const data = (await res.json()) as { field_data?: { name: string; values: string[] }[] };
      if (!data.field_data) return null;
      const map: Record<string, string> = {};
      for (const f of data.field_data) map[f.name] = f.values?.[0] ?? "";
      return {
        name: map.full_name ?? map.name,
        email: map.email,
        phone: map.phone_number ?? map.phone,
        company: map.company_name ?? map.company,
        title: map.job_title ?? map.title,
        // The consent checkbox is enforced on the Meta lead form itself.
        consent: true,
        raw: data,
      };
    }

    // Shape 2: a flat test payload {name,email,phone,...}.
    if (p && typeof p === "object" && (p.email || p.phone)) {
      return {
        name: p.name,
        email: p.email,
        phone: p.phone,
        company: p.company,
        title: p.title,
        consent: p.consent === true || p.consent === "true",
        raw: p,
      };
    }
    return null;
  }
}
