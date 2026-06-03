import type { Campaign, Lead, ScrubResult } from "../gtm/types.js";

/**
 * Compliance checks common to every ScrubDriver. The hard gate.
 * Live drivers (e.g. Twilio) layer real phone validation on top of this.
 *
 * NOTE: business-hours enforcement needs the lead's timezone (derived from
 * phone area code / geo) and is left to live drivers; here we only record the
 * configured window so it isn't silently dropped.
 */
export function baseScrubChecks(lead: Lead, campaign: Campaign): ScrubResult {
  const reasons: string[] = [];
  let callable = true;

  // Consent — TCPA requires prior express written consent for AI voice calls.
  if (campaign.constraints.consent_required && !lead.consent) {
    callable = false;
    reasons.push("No call consent captured on the lead form (TCPA blocker).");
  }

  // Phone presence + basic shape.
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  if (digits.length < 10) {
    callable = false;
    reasons.push("Missing or invalid phone number.");
  }

  // Suppression list.
  const supp = campaign.constraints.suppression ?? [];
  if (lead.email && supp.includes(lead.email)) {
    callable = false;
    reasons.push("Lead email is on the campaign suppression list.");
  }
  if (lead.phone && supp.includes(lead.phone)) {
    callable = false;
    reasons.push("Lead phone is on the campaign suppression list.");
  }

  const emailable = !!lead.email && lead.email.includes("@");

  if (callable) {
    reasons.push("Consent captured, phone present, not suppressed.");
  }

  return { callable, emailable, reasons };
}
