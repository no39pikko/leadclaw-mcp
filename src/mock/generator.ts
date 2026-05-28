import { randomBytes } from "node:crypto";
import { COMPANIES } from "./companies.js";
import { PEOPLE, ROLES_DEFAULT } from "./people.js";
import type { AppointmentRecord } from "../db/store.js";

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

const BUDGET_LINES = [
  "Confirmed: $50K-100K annual budget for sales tooling",
  "Confirmed: $30K-60K available for Q3 procurement",
  "Budget approved at $75K for fiscal year",
  "Confirmed: $100K-150K earmarked for replacing legacy stack",
  "Discretionary budget of $25K-50K, approval path confirmed",
];

const AUTHORITY_LINES = [
  "Decision maker (CEO)",
  "Final approver, owns budget for this category",
  "Decision maker with two-step approval (CFO sign-off)",
  "Primary evaluator, will bring to exec team for final call",
  "Sole decision maker (founder-led)",
];

const NEED_LINES = [
  "Currently using HubSpot, looking to replace within 90 days",
  "Outgrown current tooling, evaluating alternatives this quarter",
  "Recent funding round driving sales team scale-up",
  "Pain point: manual lead enrichment eating 15+ hrs/week",
  "Existing vendor contract expires in 60 days, actively shopping",
  "Building outbound function from scratch, no incumbent",
];

const TIMELINE_LINES = [
  "Planning to decide by end of Q3 2026",
  "Aiming to start onboarding within 4-6 weeks",
  "Decision target: next 30 days",
  "Evaluating now, signing by end of next month",
  "Q3 procurement cycle, decision locked for August",
];

const SDR_NOTES = [
  "Very interested in AI-native approach. Mentioned competitor pricing is too aggressive.",
  "Receptive call. Asked for case studies from similar-stage companies.",
  "Currently in talks with two other vendors. Open to a side-by-side comparison.",
  "Engaged conversation. Specifically interested in CRM integration depth.",
  "Strong fit. Asked about implementation timeline and onboarding support.",
  "Was already aware of the category. Wants to see live demo, not slides.",
];

const MEETING_HOSTS = ["meet.example.com", "calendar.example.com", "cal.example.com"];

function meetingLink(): string {
  const host = MEETING_HOSTS[randInt(0, MEETING_HOSTS.length - 1)];
  return `https://${host}/${randomBytes(4).toString("hex")}`;
}

// Parses a loose date_range hint into a base Date.
// Returns null when nothing usable is found — caller should fall back to "next week from now".
function parseDateRange(hint: string | undefined): Date | null {
  if (!hint) return null;
  const now = new Date();
  const lc = hint.toLowerCase();
  if (lc.includes("today")) return now;
  if (lc.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lc.includes("next week")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (lc.includes("this week")) return now;
  if (lc.includes("next month")) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  // Try to extract a Month + day (e.g. "May 20-25", "May 20")
  const monthMatch = lc.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i
  );
  if (monthMatch) {
    const monthIdx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      monthMatch[1].slice(0, 3).toLowerCase()
    );
    const day = parseInt(monthMatch[2], 10);
    const year = now.getMonth() > monthIdx ? now.getFullYear() + 1 : now.getFullYear();
    return new Date(year, monthIdx, day);
  }
  return null;
}

// Returns a weekday-business-hour datetime ISO string.
function pickMeetingTime(base: Date, indexInBatch: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + indexInBatch); // spread across consecutive days
  // Skip to next weekday if it lands on Sat/Sun.
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const hour = [10, 11, 13, 14, 15, 16][randInt(0, 5)];
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function generateAppointments(args: {
  request_id: string;
  count: number;
  target_role?: string;
  date_range?: string;
  industry?: string;
}): AppointmentRecord[] {
  const base = parseDateRange(args.date_range) ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  })();

  const usedPeople = new Set<string>();
  const usedCompanies = new Set<string>();
  const out: AppointmentRecord[] = [];

  for (let i = 0; i < args.count; i++) {
    let person = PEOPLE[randInt(0, PEOPLE.length - 1)];
    while (usedPeople.has(person)) person = PEOPLE[randInt(0, PEOPLE.length - 1)];
    usedPeople.add(person);

    let company = COMPANIES[randInt(0, COMPANIES.length - 1)];
    while (usedCompanies.has(company.name)) company = COMPANIES[randInt(0, COMPANIES.length - 1)];
    usedCompanies.add(company.name);

    const role = args.target_role && args.target_role.trim().length > 0
      ? args.target_role
      : pick(ROLES_DEFAULT, randInt(0, ROLES_DEFAULT.length - 1));

    out.push({
      appointment_id: newId("apt"),
      request_id: args.request_id,
      contact_name: person,
      company: company.name,
      company_size: company.size,
      company_stage: company.stage,
      role,
      scheduled_at: pickMeetingTime(base, i),
      meeting_link: meetingLink(),
      bant_score: {
        budget: BUDGET_LINES[randInt(0, BUDGET_LINES.length - 1)],
        authority: AUTHORITY_LINES[randInt(0, AUTHORITY_LINES.length - 1)],
        need: NEED_LINES[randInt(0, NEED_LINES.length - 1)],
        timeline: TIMELINE_LINES[randInt(0, TIMELINE_LINES.length - 1)],
      },
      sdr_notes: SDR_NOTES[randInt(0, SDR_NOTES.length - 1)],
    });
  }
  return out;
}
