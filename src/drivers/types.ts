/**
 * Driver interfaces. Every external dependency lives behind one of these so it
 * can be swapped (mock <-> live, Meta <-> LinkedIn, Retell <-> human) without
 * touching the pipeline. See GTM_AGENT_SPEC.md §3 design principles.
 */
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

export interface AdDriver {
  readonly name: string;
  launchCampaign(c: Campaign): Promise<{ adCampaignId: string; status: string }>;
  pauseCampaign(c: Campaign): Promise<void>;
  adjustBudget(c: Campaign, dailyBudget: number): Promise<void>;
  /**
   * Normalize an incoming lead-form webhook payload. Returns null if unparseable.
   * Async because some platforms (Meta) only send an id and require a follow-up
   * API call (with the campaign's account token) to retrieve the form field data.
   */
  parseLeadWebhook(payload: unknown, campaign?: Campaign): Promise<ParsedLead | null>;
}

export interface EnrichDriver {
  readonly name: string;
  enrich(lead: Lead): Promise<EnrichResult>;
}

export interface ScrubDriver {
  readonly name: string;
  /** HARD GATE. callable=false means the lead must NOT be called. */
  scrub(lead: Lead, campaign: Campaign): Promise<ScrubResult>;
}

export interface CallDriver {
  readonly name: string;
  call(lead: Lead, script: CallScript | null): Promise<CallResult>;
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  when: string; // ISO
  durationMinutes?: number;
  location?: string;
}

export interface CalendarDriver {
  readonly name: string;
  schedule(input: CalendarEventInput): Promise<ScheduleResult>;
}

export interface CrmRecordInput {
  lead: Lead;
  campaign: Campaign;
  appointment?: { when: string } | null;
  callOutcome?: string;
  notes?: string;
}

export interface CrmDriver {
  readonly name: string;
  upsert(record: CrmRecordInput): Promise<CrmResult>;
}

export interface DriverSet {
  ad: AdDriver;
  enrich: EnrichDriver;
  scrub: ScrubDriver;
  call: CallDriver;
  calendar: CalendarDriver;
  crm: CrmDriver;
}
