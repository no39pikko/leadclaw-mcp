/**
 * Mock drivers — let the whole pipeline run end-to-end with zero API keys.
 * Behavior is randomized but tuned to a *warm* (form-fill) lead, so connect
 * and book rates look like Speed-to-Lead, not cold calling.
 */
import type {
  CallDriver,
  CalendarDriver,
  CalendarEventInput,
  CrmDriver,
  CrmRecordInput,
  AdDriver,
  EnrichDriver,
  ScrubDriver,
} from "./types.js";
import type {
  Campaign,
  CallResult,
  CallScript,
  CrmResult,
  EnrichResult,
  Lead,
  ParsedLead,
  ScheduleResult,
  ScrubResult,
} from "../gtm/types.js";
import { baseScrubChecks } from "./scrubChecks.js";

const TITLES = ["CEO", "Founder", "VP Sales", "Head of Growth", "CTO", "COO"];
const CONTEXTS = [
  "Recently posted 3 sales roles — scaling outbound.",
  "Series A announced last quarter; building go-to-market.",
  "Switched off a legacy CRM 60 days ago.",
  "Founder-led sales, no SDR team yet.",
  "Growing headcount fast; pipeline is the bottleneck.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Next weekday at a random business hour, as an ISO string. */
function nextBusinessSlot(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.floor(Math.random() * 4));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
  return d.toISOString();
}

export class MockAdDriver implements AdDriver {
  readonly name = "mock-ad";
  async launchCampaign(c: Campaign) {
    return { adCampaignId: `mockad_${c.id}`, status: "active" };
  }
  async pauseCampaign(_c: Campaign) {}
  async adjustBudget(_c: Campaign, _b: number) {}
  async parseLeadWebhook(payload: unknown): Promise<ParsedLead | null> {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    const consent =
      p.consent === true || p.consent === "true" || p.consent === "on" || p.consent === 1;
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

export class MockEnrichDriver implements EnrichDriver {
  readonly name = "mock-enrich";
  async enrich(lead: Lead): Promise<EnrichResult> {
    return {
      title: lead.title || pick(TITLES),
      company: lead.company || "Acme Co",
      account_context: pick(CONTEXTS),
    };
  }
}

export class MockScrubDriver implements ScrubDriver {
  readonly name = "mock-scrub";
  async scrub(lead: Lead, campaign: Campaign): Promise<ScrubResult> {
    return baseScrubChecks(lead, campaign);
  }
}

export class MockCallDriver implements CallDriver {
  readonly name = "mock-call";
  async call(lead: Lead, _script: CallScript | null): Promise<CallResult> {
    const roll = Math.random();
    // Warm lead: hung up immediately ~10%, no-answer ~20%, otherwise reached pitch.
    if (roll < 0.1) {
      return {
        outcome: "hung_up",
        survived_seconds: Math.floor(Math.random() * 6),
        reached_pitch: false,
        hung_up_at_open: true,
        transcript: `[mock] ${lead.name} picked up and hung up immediately.`,
      };
    }
    if (roll < 0.3) {
      const vm = Math.random() < 0.5;
      return {
        outcome: vm ? "voicemail" : "no_answer",
        survived_seconds: 0,
        reached_pitch: false,
        hung_up_at_open: false,
        transcript: `[mock] ${vm ? "Voicemail left" : "No answer"} for ${lead.name}.`,
      };
    }
    // Reached pitch.
    const survived = 40 + Math.floor(Math.random() * 160);
    const bookRoll = Math.random();
    if (bookRoll < 0.4) {
      const when = nextBusinessSlot();
      return {
        outcome: "booked",
        survived_seconds: survived,
        reached_pitch: true,
        hung_up_at_open: false,
        transcript: `[mock] Spoke with ${lead.name}. Confirmed interest from the ad, qualified, booked a meeting for ${when}.`,
        appointment: { when },
      };
    }
    if (bookRoll < 0.6) {
      return {
        outcome: "callback_requested",
        survived_seconds: survived,
        reached_pitch: true,
        hung_up_at_open: false,
        transcript: `[mock] ${lead.name} is interested but asked for a callback next week.`,
      };
    }
    return {
      outcome: "not_interested",
      survived_seconds: survived,
      reached_pitch: true,
      hung_up_at_open: false,
      transcript: `[mock] ${lead.name} heard the pitch but isn't a fit right now.`,
    };
  }
}

export class MockCalendarDriver implements CalendarDriver {
  readonly name = "mock-calendar";
  async schedule(input: CalendarEventInput): Promise<ScheduleResult> {
    const id = `mockevt_${Math.random().toString(16).slice(2, 10)}`;
    return { eventId: id, htmlLink: `https://calendar.example.com/event/${id}` };
  }
}

export class MockCrmDriver implements CrmDriver {
  readonly name = "mock-crm";
  async upsert(record: CrmRecordInput): Promise<CrmResult> {
    return { ref: `mockcrm_${record.lead.id}` };
  }
}
