/**
 * Shared helpers for GTM tools: account-isolation guards.
 * A customer may only touch their own campaigns and leads.
 */
import { getCampaign, getLead } from "../gtm/db.js";
import type { Campaign, Lead } from "../gtm/types.js";

export function ownedCampaign(api_key: string, campaign_id: string): Campaign | undefined {
  const c = getCampaign(campaign_id);
  if (!c || c.account_id !== api_key) return undefined;
  return c;
}

export function ownedLead(
  api_key: string,
  lead_id: string
): { lead: Lead; campaign: Campaign } | undefined {
  const lead = getLead(lead_id);
  if (!lead) return undefined;
  const campaign = getCampaign(lead.campaign_id);
  if (!campaign || campaign.account_id !== api_key) return undefined;
  return { lead, campaign };
}

export function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export function errorText(t: string) {
  return { isError: true, content: [{ type: "text" as const, text: t }] };
}
