import { z } from "zod/v3";
import { requireAuth, authErrorResponse } from "../auth.js";
import { createCampaign, listCampaigns, updateCampaign } from "../gtm/db.js";
import { getAdDriver } from "../drivers/registry.js";
import { connectUrl as metaConnectUrl, hasMetaToken } from "../integrations/metaOAuth.js";
import { connectUrl as googleConnectUrl, hasGoogleConnection } from "../integrations/googleAdsOAuth.js";
import { provisionAgentForCampaign } from "../integrations/retellProvision.js";
import { ownedCampaign, errorText } from "./gtm_shared.js";
import type { AdCreative, AdPlatform, CallScript } from "../gtm/types.js";

// ---- define_campaign ----

export const defineCampaignShape = {
  icp: z.string().describe("Ideal Customer Profile — who you want to reach (role, company type, stage)."),
  offer: z.string().describe("What you're offering and the core hook of the ad."),
  daily_budget: z.number().describe("Ad spend per day in USD. Spend does NOT start until you call launch_campaign."),
  locations: z.array(z.string()).optional().describe('Geos to target, e.g. ["New York, NY", "remote-US"].'),
  titles: z.array(z.string()).optional().describe('Job titles to target, e.g. ["CEO", "Founder"].'),
  industries: z.array(z.string()).optional().describe("Industries to target."),
  company_sizes: z.array(z.string()).optional().describe('Company size bands, e.g. ["1-10", "11-50"].'),
  keywords: z.array(z.string()).optional().describe("Interest/keyword targeting."),
  audience_notes: z.string().optional().describe("Free-form targeting notes for the ad platform."),
  platform: z.enum(["meta", "linkedin", "google"]).optional().describe("Ad platform. Default: meta."),
  call_hours_start: z.number().optional().describe("Earliest local hour to call a lead (24h clock). Default 9."),
  call_hours_end: z.number().optional().describe("Latest local hour to call a lead (24h clock). Default 17."),
  suppression: z.array(z.string()).optional().describe("Emails/phones to never contact."),
};

export async function defineCampaignHandler(args: {
  icp: string;
  offer: string;
  daily_budget: number;
  locations?: string[];
  titles?: string[];
  industries?: string[];
  company_sizes?: string[];
  keywords?: string[];
  audience_notes?: string;
  platform?: "meta" | "linkedin" | "google";
  call_hours_start?: number;
  call_hours_end?: number;
  suppression?: string[];
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const campaign = createCampaign({
    account_id: auth.api_key,
    icp: args.icp,
    offer: args.offer,
    daily_budget: args.daily_budget,
    ad_targeting: {
      locations: args.locations,
      titles: args.titles,
      industries: args.industries,
      company_sizes: args.company_sizes,
      keywords: args.keywords,
      audience_notes: args.audience_notes,
    },
    constraints: {
      geos: args.locations ?? [],
      call_hours: { start: args.call_hours_start ?? 9, end: args.call_hours_end ?? 17 },
      consent_required: true, // TCPA — non-negotiable for AI voice calls
      suppression: args.suppression ?? [],
      platform: (args.platform ?? "meta") as AdPlatform,
    },
  });

  const summary = [
    `Campaign created: ${campaign.id} (draft, no spend yet).`,
    `  ICP: ${campaign.icp}`,
    `  Offer: ${campaign.offer}`,
    `  Platform: ${campaign.constraints.platform}   Budget: $${campaign.daily_budget}/day`,
    ``,
    `Next steps (nothing is charged until you launch):`,
    `  1. generate_ad_creative — draft the ad + lead form (must include a phone field + consent checkbox).`,
    `  2. generate_call_script — draft the AI call opener + qualification + booking flow.`,
    `  3. Review both with the user and confirm the daily budget.`,
    `  4. launch_campaign — this starts ad spend; form-fills then get an AI call within ~60s.`,
  ].join("\n");

  return {
    structuredContent: { campaign_id: campaign.id, status: campaign.status },
    content: [{ type: "text" as const, text: summary }],
  };
}

// ---- generate_ad_creative ----

export const generateAdCreativeShape = {
  campaign_id: z.string().describe("The campaign to attach creative to."),
  headline: z.string().optional().describe("Ad headline. Omit to generate a draft."),
  body: z.string().optional().describe("Ad body copy. Omit to generate a draft."),
  image_brief: z.string().optional().describe("Description of the ad visual. Omit to generate a draft."),
  form_questions: z.array(z.string()).optional().describe("Lead-form questions. A phone field + consent checkbox are always enforced."),
};

const CONSENT_LINE =
  "I agree to be contacted by phone about this request, including via automated/AI voice, at the number I provided.";

export async function generateAdCreativeHandler(args: {
  campaign_id: string;
  headline?: string;
  body?: string;
  image_brief?: string;
  form_questions?: string[];
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const baseQuestions = args.form_questions ?? [
    "Full name",
    "Work email",
    "Phone number",
    "Company",
    `What are you trying to solve with ${campaign.offer}?`,
  ];
  // Always ensure a phone field and the consent checkbox are present.
  const questions = [...baseQuestions];
  if (!questions.some((q) => /phone/i.test(q))) questions.push("Phone number");
  if (!questions.some((q) => /consent|agree to be contacted/i.test(q))) questions.push(CONSENT_LINE);

  const creative: AdCreative = {
    headline: args.headline ?? `${campaign.offer}`,
    body:
      args.body ??
      `For ${campaign.icp}. ${campaign.offer}. Tell us what you need — we'll call you within minutes.`,
    image_brief:
      args.image_brief ??
      "Clean B2B visual: product screenshot or a founder headshot, bold one-line value prop, high contrast.",
    form_questions: questions,
  };

  updateCampaign(campaign.id, { ad_creative: creative });

  const out = [
    `Ad creative saved for ${campaign.id}:`,
    `  Headline: ${creative.headline}`,
    `  Body: ${creative.body}`,
    `  Image: ${creative.image_brief}`,
    `  Form: ${creative.form_questions.map((q) => `\n    - ${q}`).join("")}`,
    ``,
    `The consent checkbox is mandatory and was enforced. Refine by calling again with overrides.`,
  ].join("\n");

  return { structuredContent: { ...creative }, content: [{ type: "text" as const, text: out }] };
}

// ---- generate_call_script ----

export const generateCallScriptShape = {
  campaign_id: z.string().describe("The campaign to attach the call script to."),
  opener: z.string().optional().describe("First line the AI says. Omit to generate a draft."),
  qualification_questions: z.array(z.string()).optional().describe("Questions to qualify the lead."),
  booking_flow: z.string().optional().describe("How the AI should book the meeting. Omit to generate a draft."),
};

export async function generateCallScriptHandler(args: {
  campaign_id: string;
  opener?: string;
  qualification_questions?: string[];
  booking_flow?: string;
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const script: CallScript = {
    opener:
      args.opener ??
      `Hi {{lead_name}}, you just filled out our form about ${campaign.offer} — is now a good time for two quick questions?`,
    ai_disclosure: "This call is handled by an AI voice assistant.",
    qualification_questions: args.qualification_questions ?? [
      "What prompted you to look into this now?",
      "Who else is involved in the decision?",
      "What's your rough timeline?",
    ],
    booking_flow:
      args.booking_flow ??
      "If the lead is a fit, offer two specific time slots this week and confirm a calendar invite to their email.",
  };

  updateCampaign(campaign.id, { call_script: script });

  const out = [
    `Call script saved for ${campaign.id}:`,
    `  Opener: ${script.opener}`,
    `  AI disclosure: ${script.ai_disclosure}`,
    `  Qualify: ${script.qualification_questions.map((q) => `\n    - ${q}`).join("")}`,
    `  Booking: ${script.booking_flow}`,
  ].join("\n");

  return { structuredContent: { ...script }, content: [{ type: "text" as const, text: out }] };
}

// ---- provision_call_agent ----

export const provisionCallAgentShape = {
  campaign_id: z.string().describe("Campaign whose AI call agent to create/refresh from its call script."),
};

export async function provisionCallAgentHandler(args: { campaign_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);
  if (!campaign.call_script) {
    return errorText("Generate the call script first (generate_call_script).");
  }
  try {
    const prov = await provisionAgentForCampaign(campaign);
    updateCampaign(campaign.id, { retell_agent_id: prov.agent_id });
    return {
      structuredContent: { agent_id: prov.agent_id, live: prov.live },
      content: [
        {
          type: "text" as const,
          text: `Call agent ${prov.live ? "provisioned" : "(mock) created"}: ${prov.agent_id}. Leads on ${campaign.id} will be called with this agent.`,
        },
      ],
    };
  } catch (err) {
    return errorText(`Agent provisioning failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- launch_campaign ----

export const launchCampaignShape = {
  campaign_id: z.string().describe("The campaign to launch. THIS STARTS AD SPEND."),
};

export async function launchCampaignHandler(args: { campaign_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const missing: string[] = [];
  if (!campaign.ad_creative) missing.push("ad creative (generate_ad_creative)");
  if (!campaign.call_script) missing.push("call script (generate_call_script)");
  if (missing.length) {
    return errorText(`Cannot launch yet — missing: ${missing.join(", ")}.`);
  }

  const ad = getAdDriver(campaign.constraints.platform);
  if (ad.name === "meta-lead-ads" && !hasMetaToken(auth.api_key)) {
    return errorText(
      `Connect your Meta ad account first — open this link and authorize:\n${metaConnectUrl(auth.api_key)}\nThen run launch_campaign again.`
    );
  }
  if (ad.name === "google-ads" && !hasGoogleConnection(auth.api_key)) {
    return errorText(
      `Connect your Google Ads account first — open this link and authorize:\n${googleConnectUrl(auth.api_key)}\nThen run launch_campaign again.`
    );
  }

  // Auto-provision the per-campaign AI call agent from the script (the setup step
  // that used to be manual). Non-fatal: calls fall back to the default agent.
  let agentNote: string;
  if (campaign.retell_agent_id) {
    agentNote = `\n  Call agent: ${campaign.retell_agent_id}`;
  } else {
    try {
      const prov = await provisionAgentForCampaign(campaign);
      updateCampaign(campaign.id, { retell_agent_id: prov.agent_id });
      agentNote = `\n  Call agent: ${prov.agent_id}${prov.live ? "" : " (mock)"}`;
    } catch (err) {
      agentNote = `\n  ⚠️ Call-agent provisioning failed (${err instanceof Error ? err.message : String(err)}); calls fall back to the default agent. Retry with provision_call_agent.`;
    }
  }

  try {
    const result = await ad.launchCampaign(campaign);
    updateCampaign(campaign.id, { status: "active", ad_campaign_id: result.adCampaignId });

    const out = [
      `🚀 Campaign ${campaign.id} is live (${ad.name}).`,
      `  External ad id: ${result.adCampaignId}`,
      `  Budget: $${campaign.daily_budget}/day. Ad spend has started.`,
      `  Incoming form-fills will be enriched, scrubbed, and called by AI within ~60s.`,
      `  Track with get_campaign_metrics; review leads with get_leads.`,
    ].join("\n") + agentNote;

    return {
      structuredContent: { campaign_id: campaign.id, ad_campaign_id: result.adCampaignId, status: "active" },
      content: [{ type: "text" as const, text: out }],
    };
  } catch (err) {
    return errorText(`Launch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- pause_campaign ----

export const pauseCampaignShape = {
  campaign_id: z.string().describe("The campaign to pause (stops ad spend)."),
};

export async function pauseCampaignHandler(args: { campaign_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  try {
    const ad = getAdDriver(campaign.constraints.platform);
    await ad.pauseCampaign(campaign);
    updateCampaign(campaign.id, { status: "paused" });
    return {
      structuredContent: { campaign_id: campaign.id, status: "paused" },
      content: [{ type: "text" as const, text: `Campaign ${campaign.id} paused. Ad spend stopped.` }],
    };
  } catch (err) {
    return errorText(`Pause failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- adjust_budget ----

export const adjustBudgetShape = {
  campaign_id: z.string().describe("The campaign to re-budget."),
  daily_budget: z.number().describe("New daily ad spend in USD."),
};

export async function adjustBudgetHandler(args: { campaign_id: string; daily_budget: number }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  try {
    const ad = getAdDriver(campaign.constraints.platform);
    await ad.adjustBudget(campaign, args.daily_budget);
    updateCampaign(campaign.id, { daily_budget: args.daily_budget });
    return {
      structuredContent: { campaign_id: campaign.id, daily_budget: args.daily_budget },
      content: [{ type: "text" as const, text: `Budget for ${campaign.id} set to $${args.daily_budget}/day.` }],
    };
  } catch (err) {
    return errorText(`Budget update failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- list_campaigns ----

export const listCampaignsShape = {};

export async function listCampaignsHandler(_args: Record<string, never>) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaigns = listCampaigns(auth.api_key);
  if (!campaigns.length) {
    return { structuredContent: { campaigns: [] }, content: [{ type: "text" as const, text: "No campaigns yet. Create one with define_campaign." }] };
  }
  const lines = campaigns.map(
    (c) => `- ${c.id} [${c.status}] ${c.constraints.platform} $${c.daily_budget}/day — ${c.offer}`
  );
  return {
    structuredContent: { campaigns: campaigns.map((c) => ({ id: c.id, status: c.status, offer: c.offer, daily_budget: c.daily_budget })) },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
