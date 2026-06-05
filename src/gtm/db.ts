/**
 * GTM Agent persistence — shares the better-sqlite3 connection from db/store.ts.
 * Tables: campaigns, leads, call_attempts, appointments, asset_events, ad_accounts.
 */
import { randomBytes } from "node:crypto";
import { db } from "../db/store.js";
import type {
  AdAccount,
  AdCreative,
  AdTargeting,
  Appointment,
  AssetEvent,
  CallAttempt,
  CallScript,
  Campaign,
  CampaignConstraints,
  CampaignStatus,
  Lead,
  LeadEnrichment,
  LeadStatus,
} from "./types.js";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

// ---- Schema ----

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id             TEXT PRIMARY KEY,
    account_id     TEXT NOT NULL,
    icp            TEXT NOT NULL DEFAULT '',
    offer          TEXT NOT NULL DEFAULT '',
    ad_targeting   TEXT NOT NULL DEFAULT '{}',
    daily_budget   REAL NOT NULL DEFAULT 0,
    constraints    TEXT NOT NULL DEFAULT '{}',
    ad_creative      TEXT,
    call_script      TEXT,
    ad_campaign_id   TEXT,
    retell_agent_id  TEXT,
    status           TEXT NOT NULL DEFAULT 'draft',
    created_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_campaigns_account ON campaigns(account_id);

  CREATE TABLE IF NOT EXISTS leads (
    id               TEXT PRIMARY KEY,
    campaign_id      TEXT NOT NULL,
    name             TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    company          TEXT NOT NULL DEFAULT '',
    phone            TEXT NOT NULL DEFAULT '',
    email            TEXT NOT NULL DEFAULT '',
    consent          INTEGER NOT NULL DEFAULT 0,
    source_platform  TEXT NOT NULL DEFAULT 'mock',
    form_submitted_at INTEGER NOT NULL,
    enrichment       TEXT,
    scrub_status     TEXT NOT NULL DEFAULT 'pending',
    status           TEXT NOT NULL DEFAULT 'received',
    created_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);

  CREATE TABLE IF NOT EXISTS call_attempts (
    id               TEXT PRIMARY KEY,
    lead_id          TEXT NOT NULL,
    backend          TEXT NOT NULL,
    outcome          TEXT NOT NULL,
    survived_seconds REAL NOT NULL DEFAULT 0,
    reached_pitch    INTEGER NOT NULL DEFAULT 0,
    hung_up_at_open  INTEGER NOT NULL DEFAULT 0,
    transcript       TEXT NOT NULL DEFAULT '',
    ts               INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calls_lead ON call_attempts(lead_id);

  CREATE TABLE IF NOT EXISTS gtm_appointments (
    id               TEXT PRIMARY KEY,
    lead_id          TEXT NOT NULL,
    campaign_id      TEXT NOT NULL,
    when_iso         TEXT NOT NULL,
    calendar_event_id TEXT,
    status           TEXT NOT NULL DEFAULT 'scheduled',
    created_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_appts_campaign ON gtm_appointments(campaign_id);

  CREATE TABLE IF NOT EXISTS asset_events (
    id          TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    lead_id     TEXT,
    stage       TEXT NOT NULL,
    cost        REAL NOT NULL DEFAULT 0,
    signal      TEXT,
    outcome     TEXT,
    ts          INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assets_campaign ON asset_events(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_assets_stage ON asset_events(stage);

  CREATE TABLE IF NOT EXISTS ad_accounts (
    account_id    TEXT NOT NULL,
    platform      TEXT NOT NULL,
    oauth_tokens  TEXT,
    managed_by_us INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (account_id, platform)
  );
`);

// Migrate DBs created before retell_agent_id existed.
try {
  db.exec("ALTER TABLE campaigns ADD COLUMN retell_agent_id TEXT");
} catch {
  /* column already exists */
}

// ---- Row mappers ----

function rowToCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    icp: r.icp as string,
    offer: r.offer as string,
    ad_targeting: JSON.parse((r.ad_targeting as string) || "{}") as AdTargeting,
    daily_budget: r.daily_budget as number,
    constraints: JSON.parse((r.constraints as string) || "{}") as CampaignConstraints,
    ad_creative: r.ad_creative ? (JSON.parse(r.ad_creative as string) as AdCreative) : null,
    call_script: r.call_script ? (JSON.parse(r.call_script as string) as CallScript) : null,
    ad_campaign_id: (r.ad_campaign_id as string) ?? null,
    retell_agent_id: (r.retell_agent_id as string) ?? null,
    status: r.status as CampaignStatus,
    created_at: r.created_at as number,
  };
}

function rowToLead(r: Record<string, unknown>): Lead {
  return {
    id: r.id as string,
    campaign_id: r.campaign_id as string,
    name: r.name as string,
    title: r.title as string,
    company: r.company as string,
    phone: r.phone as string,
    email: r.email as string,
    consent: !!(r.consent as number),
    source_platform: r.source_platform as Lead["source_platform"],
    form_submitted_at: r.form_submitted_at as number,
    enrichment: r.enrichment ? (JSON.parse(r.enrichment as string) as LeadEnrichment) : null,
    scrub_status: r.scrub_status as Lead["scrub_status"],
    status: r.status as LeadStatus,
    created_at: r.created_at as number,
  };
}

function rowToCallAttempt(r: Record<string, unknown>): CallAttempt {
  return {
    id: r.id as string,
    lead_id: r.lead_id as string,
    backend: r.backend as string,
    outcome: r.outcome as CallAttempt["outcome"],
    survived_seconds: r.survived_seconds as number,
    reached_pitch: !!(r.reached_pitch as number),
    hung_up_at_open: !!(r.hung_up_at_open as number),
    transcript: r.transcript as string,
    ts: r.ts as number,
  };
}

function rowToAppointment(r: Record<string, unknown>): Appointment {
  return {
    id: r.id as string,
    lead_id: r.lead_id as string,
    campaign_id: r.campaign_id as string,
    when: r.when_iso as string,
    calendar_event_id: (r.calendar_event_id as string) ?? null,
    status: r.status as Appointment["status"],
    created_at: r.created_at as number,
  };
}

// ---- Campaign ops ----

export function createCampaign(input: {
  account_id: string;
  icp: string;
  offer: string;
  ad_targeting: AdTargeting;
  daily_budget: number;
  constraints: CampaignConstraints;
}): Campaign {
  const id = newId("camp");
  const now = Date.now();
  db.prepare(`
    INSERT INTO campaigns (id, account_id, icp, offer, ad_targeting, daily_budget, constraints, status, created_at)
    VALUES (@id, @account_id, @icp, @offer, @ad_targeting, @daily_budget, @constraints, 'draft', @created_at)
  `).run({
    id,
    account_id: input.account_id,
    icp: input.icp,
    offer: input.offer,
    ad_targeting: JSON.stringify(input.ad_targeting),
    daily_budget: input.daily_budget,
    constraints: JSON.stringify(input.constraints),
    created_at: now,
  });
  return getCampaign(id)!;
}

export function getCampaign(id: string): Campaign | undefined {
  const r = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToCampaign(r) : undefined;
}

export function listCampaigns(account_id: string): Campaign[] {
  const rows = db.prepare("SELECT * FROM campaigns WHERE account_id = ? ORDER BY created_at DESC").all(account_id) as Record<string, unknown>[];
  return rows.map(rowToCampaign);
}

export function updateCampaign(
  id: string,
  patch: Partial<{
    ad_creative: AdCreative;
    call_script: CallScript;
    ad_campaign_id: string;
    retell_agent_id: string;
    status: CampaignStatus;
    daily_budget: number;
  }>
): Campaign | undefined {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.ad_creative !== undefined) { sets.push("ad_creative = @ad_creative"); params.ad_creative = JSON.stringify(patch.ad_creative); }
  if (patch.call_script !== undefined) { sets.push("call_script = @call_script"); params.call_script = JSON.stringify(patch.call_script); }
  if (patch.ad_campaign_id !== undefined) { sets.push("ad_campaign_id = @ad_campaign_id"); params.ad_campaign_id = patch.ad_campaign_id; }
  if (patch.retell_agent_id !== undefined) { sets.push("retell_agent_id = @retell_agent_id"); params.retell_agent_id = patch.retell_agent_id; }
  if (patch.status !== undefined) { sets.push("status = @status"); params.status = patch.status; }
  if (patch.daily_budget !== undefined) { sets.push("daily_budget = @daily_budget"); params.daily_budget = patch.daily_budget; }
  if (sets.length === 0) return getCampaign(id);
  db.prepare(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getCampaign(id);
}

// ---- Lead ops ----

export function createLead(input: {
  campaign_id: string;
  name?: string;
  title?: string;
  company?: string;
  phone?: string;
  email?: string;
  consent?: boolean;
  source_platform: Lead["source_platform"];
}): Lead {
  const id = newId("lead");
  const now = Date.now();
  db.prepare(`
    INSERT INTO leads (id, campaign_id, name, title, company, phone, email, consent, source_platform, form_submitted_at, status, scrub_status, created_at)
    VALUES (@id, @campaign_id, @name, @title, @company, @phone, @email, @consent, @source_platform, @now, 'received', 'pending', @now)
  `).run({
    id,
    campaign_id: input.campaign_id,
    name: input.name ?? "",
    title: input.title ?? "",
    company: input.company ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    consent: input.consent ? 1 : 0,
    source_platform: input.source_platform,
    now,
  });
  return getLead(id)!;
}

export function getLead(id: string): Lead | undefined {
  const r = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToLead(r) : undefined;
}

export function updateLead(
  id: string,
  patch: Partial<{
    name: string; title: string; company: string; phone: string; email: string;
    enrichment: LeadEnrichment;
    scrub_status: Lead["scrub_status"];
    status: LeadStatus;
  }>
): Lead | undefined {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const k of ["name", "title", "company", "phone", "email", "scrub_status", "status"] as const) {
    if (patch[k] !== undefined) { sets.push(`${k} = @${k}`); params[k] = patch[k]; }
  }
  if (patch.enrichment !== undefined) { sets.push("enrichment = @enrichment"); params.enrichment = JSON.stringify(patch.enrichment); }
  if (sets.length === 0) return getLead(id);
  db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getLead(id);
}

export function getLeadsByCampaign(campaign_id: string, status?: LeadStatus): Lead[] {
  const rows = status
    ? db.prepare("SELECT * FROM leads WHERE campaign_id = ? AND status = ? ORDER BY created_at DESC").all(campaign_id, status)
    : db.prepare("SELECT * FROM leads WHERE campaign_id = ? ORDER BY created_at DESC").all(campaign_id);
  return (rows as Record<string, unknown>[]).map(rowToLead);
}

// ---- Call attempt ops ----

export function recordCallAttempt(input: Omit<CallAttempt, "id" | "ts">): CallAttempt {
  const id = newId("call");
  const ts = Date.now();
  db.prepare(`
    INSERT INTO call_attempts (id, lead_id, backend, outcome, survived_seconds, reached_pitch, hung_up_at_open, transcript, ts)
    VALUES (@id, @lead_id, @backend, @outcome, @survived_seconds, @reached_pitch, @hung_up_at_open, @transcript, @ts)
  `).run({
    id,
    lead_id: input.lead_id,
    backend: input.backend,
    outcome: input.outcome,
    survived_seconds: input.survived_seconds,
    reached_pitch: input.reached_pitch ? 1 : 0,
    hung_up_at_open: input.hung_up_at_open ? 1 : 0,
    transcript: input.transcript,
    ts,
  });
  return { ...input, id, ts };
}

export function getCallAttemptsByCampaign(campaign_id: string): CallAttempt[] {
  const rows = db.prepare(`
    SELECT ca.* FROM call_attempts ca
    JOIN leads l ON l.id = ca.lead_id
    WHERE l.campaign_id = ?
    ORDER BY ca.ts DESC
  `).all(campaign_id) as Record<string, unknown>[];
  return rows.map(rowToCallAttempt);
}

// ---- Appointment ops ----

export function saveAppointment(input: {
  lead_id: string;
  campaign_id: string;
  when: string;
  calendar_event_id?: string | null;
}): Appointment {
  const id = newId("apt");
  const now = Date.now();
  db.prepare(`
    INSERT INTO gtm_appointments (id, lead_id, campaign_id, when_iso, calendar_event_id, status, created_at)
    VALUES (@id, @lead_id, @campaign_id, @when_iso, @calendar_event_id, 'scheduled', @created_at)
  `).run({
    id,
    lead_id: input.lead_id,
    campaign_id: input.campaign_id,
    when_iso: input.when,
    calendar_event_id: input.calendar_event_id ?? null,
    created_at: now,
  });
  return rowToAppointment(db.prepare("SELECT * FROM gtm_appointments WHERE id = ?").get(id) as Record<string, unknown>);
}

export function getAppointmentsByCampaign(campaign_id: string): Appointment[] {
  const rows = db.prepare("SELECT * FROM gtm_appointments WHERE campaign_id = ? ORDER BY created_at DESC").all(campaign_id) as Record<string, unknown>[];
  return rows.map(rowToAppointment);
}

// ---- Asset events (the flywheel) ----

export function logAssetEvent(input: {
  campaign_id: string;
  lead_id?: string | null;
  stage: string;
  cost?: number;
  signal?: string | null;
  outcome?: string | null;
}): AssetEvent {
  const id = newId("ae");
  const ts = Date.now();
  const ev: AssetEvent = {
    id,
    campaign_id: input.campaign_id,
    lead_id: input.lead_id ?? null,
    stage: input.stage,
    cost: input.cost ?? 0,
    signal: input.signal ?? null,
    outcome: input.outcome ?? null,
    ts,
  };
  db.prepare(`
    INSERT INTO asset_events (id, campaign_id, lead_id, stage, cost, signal, outcome, ts)
    VALUES (@id, @campaign_id, @lead_id, @stage, @cost, @signal, @outcome, @ts)
  `).run(ev);
  return ev;
}

export function queryAssets(filter: { campaign_id?: string; stage?: string; limit?: number }): AssetEvent[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.campaign_id) { where.push("campaign_id = ?"); params.push(filter.campaign_id); }
  if (filter.stage) { where.push("stage = ?"); params.push(filter.stage); }
  const limit = Math.min(filter.limit ?? 100, 1000);
  const sql = `SELECT * FROM asset_events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ts DESC LIMIT ${limit}`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    campaign_id: r.campaign_id as string,
    lead_id: (r.lead_id as string) ?? null,
    stage: r.stage as string,
    cost: r.cost as number,
    signal: (r.signal as string) ?? null,
    outcome: (r.outcome as string) ?? null,
    ts: r.ts as number,
  }));
}

export interface CampaignMetrics {
  campaign_id: string;
  status: CampaignStatus;
  spend: number;
  leads: number;
  scrubbed_out: number;
  calls: number;
  connected: number;
  connect_rate: number;
  booked: number;
  book_rate: number;
  cost_per_meeting: number | null;
  avg_survived_seconds: number;
  hung_up_at_open: number;
}

export function campaignMetrics(campaign_id: string): CampaignMetrics | undefined {
  const campaign = getCampaign(campaign_id);
  if (!campaign) return undefined;

  const spend = (db.prepare("SELECT COALESCE(SUM(cost),0) c FROM asset_events WHERE campaign_id = ?").get(campaign_id) as { c: number }).c;
  const leads = (db.prepare("SELECT COUNT(*) c FROM leads WHERE campaign_id = ?").get(campaign_id) as { c: number }).c;
  const scrubbed_out = (db.prepare("SELECT COUNT(*) c FROM leads WHERE campaign_id = ? AND status = 'skipped'").get(campaign_id) as { c: number }).c;
  const booked = (db.prepare("SELECT COUNT(*) c FROM gtm_appointments WHERE campaign_id = ?").get(campaign_id) as { c: number }).c;

  const callRow = db.prepare(`
    SELECT
      COUNT(*) calls,
      COALESCE(SUM(reached_pitch),0) connected,
      COALESCE(AVG(survived_seconds),0) avg_secs,
      COALESCE(SUM(hung_up_at_open),0) hung
    FROM call_attempts ca JOIN leads l ON l.id = ca.lead_id
    WHERE l.campaign_id = ?
  `).get(campaign_id) as { calls: number; connected: number; avg_secs: number; hung: number };

  const calls = callRow.calls;
  const connected = callRow.connected;

  return {
    campaign_id,
    status: campaign.status,
    spend,
    leads,
    scrubbed_out,
    calls,
    connected,
    connect_rate: calls ? connected / calls : 0,
    booked,
    book_rate: connected ? booked / connected : 0,
    cost_per_meeting: booked ? spend / booked : null,
    avg_survived_seconds: callRow.avg_secs,
    hung_up_at_open: callRow.hung,
  };
}

// ---- Credit metering (provisional) ----

/**
 * Atomically charge credits to an account. Only deducts if the balance covers it.
 * Returns ok=false (and does not deduct) when funds are insufficient — the pipeline
 * then skips paid stages / pauses the campaign rather than going negative.
 */
export function chargeCredits(account_id: string, amount: number): { ok: boolean; remaining: number } {
  const read = () => (db.prepare("SELECT credits FROM accounts WHERE api_key = ?").get(account_id) as { credits: number } | undefined)?.credits ?? 0;
  if (amount <= 0) return { ok: true, remaining: read() };
  const res = db.prepare("UPDATE accounts SET credits = credits - ? WHERE api_key = ? AND credits >= ?").run(amount, account_id, amount);
  return { ok: res.changes > 0, remaining: read() };
}

// ---- Ad account ops ----

export function upsertAdAccount(input: AdAccount): void {
  db.prepare(`
    INSERT INTO ad_accounts (account_id, platform, oauth_tokens, managed_by_us)
    VALUES (@account_id, @platform, @oauth_tokens, @managed_by_us)
    ON CONFLICT(account_id, platform) DO UPDATE SET
      oauth_tokens = excluded.oauth_tokens,
      managed_by_us = excluded.managed_by_us
  `).run({
    account_id: input.account_id,
    platform: input.platform,
    oauth_tokens: input.oauth_tokens ?? null,
    managed_by_us: input.managed_by_us ? 1 : 0,
  });
}

export function getAdAccount(account_id: string, platform: string): AdAccount | undefined {
  const r = db.prepare("SELECT * FROM ad_accounts WHERE account_id = ? AND platform = ?").get(account_id, platform) as Record<string, unknown> | undefined;
  if (!r) return undefined;
  return {
    account_id: r.account_id as string,
    platform: r.platform as AdAccount["platform"],
    oauth_tokens: (r.oauth_tokens as string) ?? null,
    managed_by_us: !!(r.managed_by_us as number),
  };
}
