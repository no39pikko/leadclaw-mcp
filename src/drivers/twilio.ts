/**
 * TwilioScrubDriver — layers real phone validation (Twilio Lookup v2) on top of
 * the common compliance checks. Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 */
import type { ScrubDriver } from "./types.js";
import type { Campaign, Lead, ScrubResult } from "../gtm/types.js";
import { baseScrubChecks } from "./scrubChecks.js";

export class TwilioScrubDriver implements ScrubDriver {
  readonly name = "twilio-scrub";
  private sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  private token = process.env.TWILIO_AUTH_TOKEN ?? "";

  async scrub(lead: Lead, campaign: Campaign): Promise<ScrubResult> {
    const base = baseScrubChecks(lead, campaign);
    if (!base.callable) return base; // already blocked — no need to spend a lookup

    const phone = encodeURIComponent(lead.phone);
    const auth = Buffer.from(`${this.sid}:${this.token}`).toString("base64");
    const res = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${phone}?Fields=line_type_intelligence`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (!res.ok) {
      return {
        callable: false,
        emailable: base.emailable,
        reasons: [...base.reasons, `Phone failed Twilio lookup (HTTP ${res.status}).`],
      };
    }
    const data = (await res.json()) as Record<string, any>;
    if (data.valid === false) {
      return {
        callable: false,
        emailable: base.emailable,
        reasons: [...base.reasons, "Phone number is not valid (Twilio)."],
      };
    }
    const lineType = data.line_type_intelligence?.type;
    return {
      callable: true,
      emailable: base.emailable,
      reasons: [...base.reasons, `Twilio: valid ${lineType ?? "number"}.`],
    };
  }
}
