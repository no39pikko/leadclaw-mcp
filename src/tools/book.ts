import { z } from "zod/v3";
import { putRequest } from "../db/store.js";
import { generateAppointments, newId } from "../mock/generator.js";

export const bookInputShape = {
  location: z
    .string()
    .describe('Geographic target, e.g. "Dallas, TX", "San Francisco Bay Area", "remote-US".'),
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("How many confirmed appointments to deliver (1-10)."),
  industry: z
    .string()
    .optional()
    .describe('Target industry vertical, e.g. "AI startups", "healthcare SaaS".'),
  target_role: z
    .string()
    .optional()
    .describe('Target buyer role, e.g. "CEO", "VP Sales", "CTO".'),
  date_range: z
    .string()
    .optional()
    .describe('Preferred meeting window in natural language, e.g. "next week", "May 20-25".'),
  budget_per_appointment: z
    .number()
    .optional()
    .describe("Budget cap per confirmed appointment in USD. Defaults to 100."),
  notes: z
    .string()
    .optional()
    .describe("Free-form qualifying notes, e.g. 'Series A or later only'."),
};

const ETA_HOURS = 48;

export async function bookAppointmentsHandler(args: {
  location: string;
  count: number;
  industry?: string;
  target_role?: string;
  date_range?: string;
  budget_per_appointment?: number;
  notes?: string;
}) {
  const request_id = newId("req");
  const created_at = Date.now();
  const appointments = generateAppointments({
    request_id,
    count: args.count,
    target_role: args.target_role,
    date_range: args.date_range,
    industry: args.industry,
  });

  putRequest({
    request_id,
    created_at,
    params: {
      location: args.location,
      count: args.count,
      industry: args.industry,
      target_role: args.target_role,
      date_range: args.date_range,
      budget_per_appointment: args.budget_per_appointment,
      notes: args.notes,
    },
    appointments,
  });

  const eta = new Date(created_at + ETA_HOURS * 60 * 60 * 1000).toISOString();
  const budget = args.budget_per_appointment ?? 100;
  const totalCap = budget * args.count;

  const summary =
    `Request received. Matching SDRs in ${args.location}` +
    (args.industry ? ` for ${args.industry}` : "") +
    (args.target_role ? ` (${args.target_role})` : "") +
    `. Targeting ${args.count} confirmed appointment${args.count > 1 ? "s" : ""} at up to $${budget}/each ($${totalCap} cap). ETA ${ETA_HOURS}h.`;

  const payload = {
    request_id,
    status: "processing" as const,
    estimated_completion: eta,
    message: summary,
  };

  return {
    structuredContent: payload,
    content: [
      {
        type: "text" as const,
        text: summary + `\nrequest_id: ${request_id}`,
      },
    ],
  };
}
