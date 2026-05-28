import { z } from "zod/v3";
import { getRequest } from "../db/store.js";

export const statusInputShape = {
  request_id: z
    .string()
    .describe("The request_id returned from book_appointments."),
};

// Demo-only progression. Wall-clock since request creation drives the status,
// so the demo feels live without needing background workers.
const MATCHING_AT_MS = 5 * 1000; // 5s   → "matching"
const IN_PROGRESS_AT_MS = 15 * 1000; // 15s  → "in_progress", first confirmation
const PER_CONFIRMATION_MS = 30 * 1000; // +30s per additional confirmation

type Phase = "processing" | "matching" | "in_progress" | "completed";

function phaseFor(elapsedMs: number, totalCount: number): { phase: Phase; confirmed: number } {
  if (elapsedMs < MATCHING_AT_MS) return { phase: "processing", confirmed: 0 };
  if (elapsedMs < IN_PROGRESS_AT_MS) return { phase: "matching", confirmed: 0 };
  const confirmed = Math.min(
    totalCount,
    1 + Math.floor((elapsedMs - IN_PROGRESS_AT_MS) / PER_CONFIRMATION_MS)
  );
  return {
    phase: confirmed >= totalCount ? "completed" : "in_progress",
    confirmed,
  };
}

export async function checkStatusHandler(args: { request_id: string }) {
  const req = getRequest(args.request_id);
  if (!req) {
    const msg = `No request found with id ${args.request_id}.`;
    return {
      isError: true,
      content: [{ type: "text" as const, text: msg }],
    };
  }

  const elapsed = Date.now() - req.created_at;
  const { phase, confirmed } = phaseFor(elapsed, req.params.count);

  const visibleAppointments = req.appointments.slice(0, confirmed).map((a) => ({
    appointment_id: a.appointment_id,
    contact_name: a.contact_name,
    company: a.company,
    role: a.role,
    scheduled_at: a.scheduled_at,
    bant_score: "4/4",
  }));

  const headline = (() => {
    switch (phase) {
      case "processing":
        return `Request ${args.request_id} received. Matching SDRs now.`;
      case "matching":
        return `SDRs matched. Outreach starting shortly.`;
      case "in_progress":
        return `${confirmed} of ${req.params.count} confirmed. SDRs still working remaining seats.`;
      case "completed":
        return `${confirmed} of ${req.params.count} appointments confirmed. All BANT 4/4.`;
    }
  })();

  const payload = {
    request_id: args.request_id,
    status: phase,
    requested_count: req.params.count,
    confirmed_count: confirmed,
    appointments: visibleAppointments,
  };

  const lines = [headline];
  for (const a of visibleAppointments) {
    const when = new Date(a.scheduled_at).toUTCString();
    lines.push(`- ${when}: ${a.contact_name}, ${a.role}, ${a.company} (${a.appointment_id})`);
  }

  return {
    structuredContent: payload,
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
