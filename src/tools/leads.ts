import { z } from "zod/v3";
import { requireAuth, authErrorResponse } from "../auth.js";
import { createLead, getLead, getLeadsByCampaign } from "../gtm/db.js";
import { runEnrich, runScrub, runCall, speedToLead } from "../gtm/pipeline.js";
import { ownedCampaign, ownedLead, errorText } from "./gtm_shared.js";
import type { LeadStatus } from "../gtm/types.js";

// ---- get_leads ----

export const getLeadsShape = {
  campaign_id: z.string().describe("Campaign to list leads for."),
  status: z
    .enum(["received", "enriched", "scrubbed", "skipped", "calling", "called", "booked", "failed"])
    .optional()
    .describe("Optional status filter."),
};

export async function getLeadsHandler(args: { campaign_id: string; status?: LeadStatus }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const leads = getLeadsByCampaign(args.campaign_id, args.status);
  const lines = leads.map(
    (l) => `- ${l.id} [${l.status}] ${l.name || "(no name)"} ${l.title ? `(${l.title})` : ""} @ ${l.company || "?"} — ${l.phone || "no phone"}`
  );
  return {
    structuredContent: {
      leads: leads.map((l) => ({
        id: l.id,
        status: l.status,
        name: l.name,
        company: l.company,
        title: l.title,
        phone: l.phone,
        email: l.email,
        scrub_status: l.scrub_status,
      })),
    },
    content: [{ type: "text" as const, text: leads.length ? lines.join("\n") : "No leads yet for this campaign." }],
  };
}

// ---- enrich_lead ----

export const enrichLeadShape = {
  lead_id: z.string().describe("Lead to enrich (adds title, company, phone, account context)."),
};

export async function enrichLeadHandler(args: { lead_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const owned = ownedLead(auth.api_key, args.lead_id);
  if (!owned) return errorText(`Lead not found: ${args.lead_id}`);

  const result = await runEnrich(owned.lead, owned.campaign);
  return {
    structuredContent: { ...result },
    content: [
      {
        type: "text" as const,
        text: `Enriched ${args.lead_id}: ${result.title ?? "?"} @ ${result.company ?? "?"}${result.account_context ? ` — ${result.account_context}` : ""}`,
      },
    ],
  };
}

// ---- scrub_lead ----

export const scrubLeadShape = {
  lead_id: z.string().describe("Lead to run the compliance gate on (consent, valid phone, hours, suppression)."),
};

export async function scrubLeadHandler(args: { lead_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const owned = ownedLead(auth.api_key, args.lead_id);
  if (!owned) return errorText(`Lead not found: ${args.lead_id}`);

  const result = await runScrub(owned.lead, owned.campaign);
  return {
    structuredContent: { ...result },
    content: [
      {
        type: "text" as const,
        text: `${result.callable ? "✅ CALLABLE" : "⛔ BLOCKED"} — ${result.reasons.join(" ")}`,
      },
    ],
  };
}

// ---- call_lead ----

export const callLeadShape = {
  lead_id: z.string().describe("Hot lead to call with the AI voice agent. Auto-runs the scrub gate first; refuses if blocked."),
};

export async function callLeadHandler(args: { lead_id: string }) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const owned = ownedLead(auth.api_key, args.lead_id);
  if (!owned) return errorText(`Lead not found: ${args.lead_id}`);

  // Hard gate: must pass scrub before any dial.
  let lead = owned.lead;
  if (lead.scrub_status === "pending") {
    await runScrub(lead, owned.campaign);
    lead = getLead(args.lead_id)!;
  }
  if (lead.scrub_status !== "callable") {
    return errorText(`Lead ${args.lead_id} failed the compliance gate and will not be called.`);
  }

  const { call, appointment_id, note } = await runCall(lead, owned.campaign);
  if (!call) {
    return { structuredContent: { called: false, note }, content: [{ type: "text" as const, text: note ?? "Call not placed." }] };
  }

  const lines = [
    `Call outcome: ${call.outcome} (survived ${call.survived_seconds}s, reached_pitch=${call.reached_pitch})`,
  ];
  if (appointment_id) lines.push(`📅 Booked — appointment ${appointment_id} at ${call.appointment?.when}`);
  lines.push(`Transcript: ${call.transcript}`);

  return {
    structuredContent: { called: true, appointment_id, ...call },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

// ---- submit_test_lead (simulation / demo) ----

export const submitTestLeadShape = {
  campaign_id: z.string().describe("Campaign this lead belongs to."),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().describe("Phone is required to call the lead."),
  company: z.string().optional(),
  title: z.string().optional(),
  consent: z.boolean().optional().describe("Whether the form's consent checkbox was ticked. Defaults true for simulation."),
};

export async function submitTestLeadHandler(args: {
  campaign_id: string;
  name?: string;
  email?: string;
  phone: string;
  company?: string;
  title?: string;
  consent?: boolean;
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }
  const campaign = ownedCampaign(auth.api_key, args.campaign_id);
  if (!campaign) return errorText(`Campaign not found: ${args.campaign_id}`);

  const lead = createLead({
    campaign_id: campaign.id,
    name: args.name,
    email: args.email,
    phone: args.phone,
    company: args.company,
    title: args.title,
    consent: args.consent ?? true,
    source_platform: campaign.constraints.platform,
  });

  // Runs the full Speed-to-Lead pipeline, exactly like a real webhook form-fill.
  const result = await speedToLead(lead.id);

  const lines = [
    `Simulated form-fill ${lead.id} → ran Speed-to-Lead pipeline.`,
    `  Final status: ${result.status}`,
    `  Scrub: ${result.scrub_reasons.join(" ")}`,
  ];
  if (result.call) lines.push(`  Call: ${result.call.outcome} (${result.call.survived_seconds}s)`);
  if (result.appointment_id) lines.push(`  📅 Booked appointment ${result.appointment_id} at ${result.call?.appointment?.when}`);
  lines.push(`  Credits spent: ${result.credits_spent}`);
  if (result.note) lines.push(`  Note: ${result.note}`);

  return { structuredContent: { ...result }, content: [{ type: "text" as const, text: lines.join("\n") }] };
}
