import { z } from "zod/v3";
import { requireAuth, authErrorResponse } from "../auth.js";
import { campaignMetrics, logAssetEvent, queryAssets } from "../gtm/db.js";
import { ownedCampaign, errorText } from "./gtm_shared.js";

// ---- get_campaign_metrics ----

export const campaignMetricsShape = {
  campaign_id: z.string().describe("Campaign to report funnel metrics for."),
};

export async function getCampaignMetricsHandler(args: { campaign_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const m = campaignMetrics(args.campaign_id);
  if (!m) return errorText(`No metrics for ${args.campaign_id}`);

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    `Campaign ${m.campaign_id} [${m.status}]`,
    `  Spend: ${m.spend} credits`,
    `  Leads: ${m.leads}  (scrubbed out: ${m.scrubbed_out})`,
    `  Calls: ${m.calls}  Connected: ${m.connected}  (connect rate ${pct(m.connect_rate)})`,
    `  Booked: ${m.booked}  (book rate ${pct(m.book_rate)})`,
    `  Cost per meeting: ${m.cost_per_meeting === null ? "—" : `${Math.round(m.cost_per_meeting)} credits`}`,
    `  Avg survived: ${Math.round(m.avg_survived_seconds)}s  Hung up at open: ${m.hung_up_at_open}`,
  ];
  return { structuredContent: { ...m }, content: [{ type: "text" as const, text: lines.join("\n") }] };
}

// ---- query_assets ----

export const queryAssetsShape = {
  campaign_id: z.string().optional().describe("Filter to one campaign (recommended)."),
  stage: z.string().optional().describe('Filter by stage, e.g. "call", "booked", "scrub", "lead_received".'),
  limit: z.number().optional().describe("Max rows (default 100, cap 1000)."),
};

export async function queryAssetsHandler(args: { campaign_id?: string; stage?: string; limit?: number }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  // Account isolation: if a campaign is named, it must be owned. Without one,
  // restrict to the caller's campaigns is not enforceable per-row cheaply here,
  // so require a campaign_id the caller owns.
  if (!args.campaign_id) {
    return errorText("Provide a campaign_id you own to query its asset events.");
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const rows = queryAssets({ campaign_id: args.campaign_id, stage: args.stage, limit: args.limit });
  return {
    structuredContent: { rows },
    content: [
      {
        type: "text" as const,
        text: rows.length
          ? rows.map((r) => `${new Date(r.ts).toISOString()} ${r.stage} cost=${r.cost}${r.outcome ? ` ${r.outcome}` : ""}`).join("\n")
          : "No asset events match.",
      },
    ],
  };
}

// ---- log_asset ----

export const logAssetShape = {
  campaign_id: z.string().describe("Campaign the event belongs to."),
  stage: z.string().describe('Event/stage label, e.g. "note", "manual_followup".'),
  signal: z.string().optional().describe("Optional signal/value."),
  outcome: z.string().optional().describe("Optional outcome."),
};

export async function logAssetHandler(args: {
  campaign_id: string;
  stage: string;
  signal?: string;
  outcome?: string;
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const ev = logAssetEvent({
    campaign_id: args.campaign_id,
    stage: args.stage,
    signal: args.signal,
    outcome: args.outcome,
  });
  return { structuredContent: { event_id: ev.id }, content: [{ type: "text" as const, text: `Logged ${args.stage} (${ev.id}).` }] };
}
