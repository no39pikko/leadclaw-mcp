/**
 * The Speed-to-Lead engine.
 *
 * Given a freshly-arrived lead: enrich -> scrub (HARD GATE) -> call -> if booked
 * schedule + CRM -> log every stage to the asset store with credit metering.
 *
 * Runs server-side (fired by the lead webhook), so it never blocks a user
 * request — that's what lets the call happen within ~60s of the form-fill even
 * when the customer's Claude is offline.
 */
import { getDrivers } from "../drivers/registry.js";
import { RATES } from "./pricing.js";
import {
  chargeCredits,
  getCampaign,
  getLead,
  logAssetEvent,
  recordCallAttempt,
  saveAppointment,
  updateLead,
} from "./db.js";
import type { Campaign, CallResult, EnrichResult, Lead, ScrubResult } from "./types.js";

export interface PipelineResult {
  lead_id: string;
  status: Lead["status"];
  callable: boolean;
  scrub_reasons: string[];
  call?: CallResult;
  appointment_id?: string;
  credits_spent: number;
  note?: string;
}

/** Charge credits for a stage and record the spend as an asset event. */
function meter(
  campaign: Campaign,
  lead_id: string,
  stage: string,
  amount: number,
  outcome?: string
): { spent: number; ok: boolean } {
  const { ok } = chargeCredits(campaign.account_id, amount);
  const spent = ok ? amount : 0;
  logAssetEvent({
    campaign_id: campaign.id,
    lead_id,
    stage,
    cost: spent,
    outcome: outcome ?? (ok ? null : "insufficient_credits"),
  });
  return { spent, ok };
}

function balanceOf(account_id: string): number {
  return chargeCredits(account_id, 0).remaining;
}

// ---- Individual stages (also reused by the enrich_lead / scrub_lead / call_lead tools) ----

export async function runEnrich(lead: Lead, campaign: Campaign): Promise<EnrichResult> {
  const { enrich } = getDrivers();
  const result = await enrich.enrich(lead);
  updateLead(lead.id, {
    title: result.title ?? lead.title,
    company: result.company ?? lead.company,
    phone: result.phone ?? lead.phone,
    email: result.email ?? lead.email,
    enrichment: {
      title: result.title,
      company: result.company,
      account_context: result.account_context,
    },
    status: "enriched",
  });
  meter(campaign, lead.id, "enrich", RATES.enrich, enrich.name);
  return result;
}

export async function runScrub(lead: Lead, campaign: Campaign): Promise<ScrubResult> {
  const { scrub } = getDrivers();
  const result = await scrub.scrub(lead, campaign);
  updateLead(lead.id, {
    scrub_status: result.callable ? "callable" : "blocked",
    status: result.callable ? "scrubbed" : "skipped",
  });
  meter(
    campaign,
    lead.id,
    "scrub",
    RATES.scrub,
    result.callable ? "callable" : `blocked: ${result.reasons.join("; ")}`
  );
  return result;
}

export async function runCall(
  lead: Lead,
  campaign: Campaign
): Promise<{ call: CallResult | null; appointment_id?: string; note?: string }> {
  // Don't dial a broke account.
  if (balanceOf(campaign.account_id) <= 0) {
    logAssetEvent({ campaign_id: campaign.id, lead_id: lead.id, stage: "call", cost: 0, outcome: "skipped_no_credits" });
    return { call: null, note: "Skipped call — account is out of credits." };
  }

  const { call, calendar, crm } = getDrivers();
  const result = await call.call(lead, campaign.call_script, campaign.retell_agent_id ?? undefined);
  recordCallAttempt({
    lead_id: lead.id,
    backend: call.name,
    outcome: result.outcome,
    survived_seconds: result.survived_seconds,
    reached_pitch: result.reached_pitch,
    hung_up_at_open: result.hung_up_at_open,
    transcript: result.transcript,
  });
  meter(
    campaign,
    lead.id,
    "call",
    result.reached_pitch ? RATES.call_connected : RATES.call_attempt,
    result.outcome
  );
  updateLead(lead.id, { status: "called" });

  if (!result.appointment) {
    return { call: result };
  }

  // Booked — put it on the calendar + CRM.
  const fresh = getLead(lead.id)!;
  const summary = `[GTM] ${fresh.name || fresh.company || "Lead"} — ${fresh.title || "meeting"}`;
  const description = [
    `Source: ${fresh.source_platform} ad → form-fill → AI call`,
    `Company: ${fresh.company}`,
    `Phone: ${fresh.phone}   Email: ${fresh.email}`,
    fresh.enrichment?.account_context ? `Context: ${fresh.enrichment.account_context}` : "",
    ``,
    `Transcript:`,
    result.transcript,
  ]
    .filter(Boolean)
    .join("\n");

  let calendarEventId: string | null = null;
  try {
    const ev = await calendar.schedule({
      summary,
      description,
      when: result.appointment.when,
      durationMinutes: 30,
    });
    calendarEventId = ev.eventId;
  } catch (err) {
    logAssetEvent({ campaign_id: campaign.id, lead_id: lead.id, stage: "calendar_error", cost: 0, outcome: String(err) });
  }

  const appt = saveAppointment({
    lead_id: lead.id,
    campaign_id: campaign.id,
    when: result.appointment.when,
    calendar_event_id: calendarEventId,
  });

  try {
    await crm.upsert({ lead: fresh, campaign, appointment: result.appointment, callOutcome: result.outcome });
  } catch (err) {
    logAssetEvent({ campaign_id: campaign.id, lead_id: lead.id, stage: "crm_error", cost: 0, outcome: String(err) });
  }

  updateLead(lead.id, { status: "booked" });
  logAssetEvent({
    campaign_id: campaign.id,
    lead_id: lead.id,
    stage: "booked",
    cost: 0,
    signal: result.appointment.when,
    outcome: "booked",
  });

  return { call: result, appointment_id: appt.id };
}

// ---- Full pipeline ----

export async function speedToLead(lead_id: string): Promise<PipelineResult> {
  const lead = getLead(lead_id);
  if (!lead) throw new Error(`Lead not found: ${lead_id}`);
  const campaign = getCampaign(lead.campaign_id);
  if (!campaign) throw new Error(`Campaign not found for lead ${lead_id}`);

  // Ad spend for this form-fill is already incurred upstream; meter it.
  let credits_spent = 0;
  credits_spent += meter(campaign, lead.id, "lead_received", RATES.ad_spend_per_lead, lead.source_platform).spent;

  await runEnrich(lead, campaign);
  credits_spent += RATES.enrich;

  const scrub = await runScrub(getLead(lead_id)!, campaign);
  if (!scrub.callable) {
    return {
      lead_id,
      status: "skipped",
      callable: false,
      scrub_reasons: scrub.reasons,
      credits_spent,
      note: "Lead failed the compliance gate — not called.",
    };
  }

  const { call, appointment_id, note } = await runCall(getLead(lead_id)!, campaign);
  if (call) credits_spent += call.reached_pitch ? RATES.call_connected : RATES.call_attempt;

  return {
    lead_id,
    status: getLead(lead_id)!.status,
    callable: true,
    scrub_reasons: scrub.reasons,
    call: call ?? undefined,
    appointment_id,
    credits_spent,
    note,
  };
}
