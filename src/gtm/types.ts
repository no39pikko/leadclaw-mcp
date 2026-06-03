/**
 * GTM Agent domain types (ads -> Speed-to-Lead model).
 * See GTM_AGENT_SPEC.md.
 */

export type CampaignStatus = "draft" | "active" | "paused" | "ended";

export type LeadStatus =
  | "received" // form-fill landed
  | "enriched"
  | "scrubbed"
  | "skipped" // failed the scrub hard gate — never called
  | "calling"
  | "called"
  | "booked"
  | "failed";

export type CallOutcome =
  | "booked"
  | "not_interested"
  | "callback_requested"
  | "no_answer"
  | "voicemail"
  | "hung_up"
  | "failed";

export type AdPlatform = "meta" | "linkedin" | "google" | "mock";

export interface AdTargeting {
  locations?: string[];
  titles?: string[];
  industries?: string[];
  company_sizes?: string[];
  keywords?: string[];
  audience_notes?: string;
}

export interface CampaignConstraints {
  geos: string[];
  /** Business-hours gate, in the lead's local time. 24h clock. */
  call_hours: { start: number; end: number };
  /** Always true in v1 — TCPA requires prior express written consent for AI voice. */
  consent_required: boolean;
  suppression: string[];
  platform: AdPlatform;
}

export interface AdCreative {
  headline: string;
  body: string;
  image_brief: string;
  /** Questions on the lead form. MUST capture phone + a consent checkbox. */
  form_questions: string[];
}

export interface CallScript {
  opener: string;
  ai_disclosure: string;
  qualification_questions: string[];
  booking_flow: string;
}

export interface Campaign {
  id: string;
  account_id: string; // = api_key
  icp: string;
  offer: string;
  ad_targeting: AdTargeting;
  daily_budget: number; // USD/day
  constraints: CampaignConstraints;
  ad_creative: AdCreative | null;
  call_script: CallScript | null;
  ad_campaign_id: string | null; // external id from the ad platform
  status: CampaignStatus;
  created_at: number;
}

export interface LeadEnrichment {
  title?: string;
  company?: string;
  account_context?: string;
  [k: string]: unknown;
}

export interface Lead {
  id: string;
  campaign_id: string;
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  consent: boolean;
  source_platform: AdPlatform;
  form_submitted_at: number;
  enrichment: LeadEnrichment | null;
  scrub_status: "pending" | "callable" | "blocked";
  status: LeadStatus;
  created_at: number;
}

export interface CallAttempt {
  id: string;
  lead_id: string;
  backend: string; // "retell" | "mock" | "human"
  outcome: CallOutcome;
  survived_seconds: number;
  reached_pitch: boolean;
  hung_up_at_open: boolean;
  transcript: string;
  ts: number;
}

export interface Appointment {
  id: string;
  lead_id: string;
  campaign_id: string;
  when: string; // ISO
  calendar_event_id: string | null;
  status: "scheduled" | "cancelled" | "completed";
  created_at: number;
}

/** The flywheel row — one per pipeline stage event, for the brain to query. */
export interface AssetEvent {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  stage: string; // "lead_received" | "enrich" | "scrub" | "call" | "booked" | ...
  cost: number; // credits spent on this stage
  signal: string | null;
  outcome: string | null;
  ts: number;
}

export interface AdAccount {
  account_id: string; // = api_key
  platform: AdPlatform;
  oauth_tokens: string | null; // JSON; null when managed by us
  managed_by_us: boolean;
}

// ---- Driver-facing result types ----

export interface EnrichResult {
  phone?: string;
  email?: string;
  title?: string;
  company?: string;
  account_context?: string;
}

export interface ScrubResult {
  callable: boolean;
  emailable?: boolean;
  reasons: string[];
}

export interface CallResult {
  outcome: CallOutcome;
  survived_seconds: number;
  reached_pitch: boolean;
  hung_up_at_open: boolean;
  transcript: string;
  /** Present only when the call booked a meeting. */
  appointment?: { when: string };
}

/** Normalized lead extracted from an ad-platform webhook payload. */
export interface ParsedLead {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  consent?: boolean;
  raw?: unknown;
}

export interface ScheduleResult {
  eventId: string;
  htmlLink: string;
}

export interface CrmResult {
  ref: string;
}
