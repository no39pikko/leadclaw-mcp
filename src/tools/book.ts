import { z } from "zod/v3";
import { putRequest, deductCredits } from "../db/store.js";
import { generateAppointments, newId } from "../mock/generator.js";
import { requireAuth, authErrorResponse } from "../auth.js";

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
    .describe("Target industry vertical. Omit to use your account default."),
  target_role: z
    .string()
    .optional()
    .describe('Target buyer role, e.g. "CEO", "VP Sales". Omit to use your account default.'),
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
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const { api_key, account } = auth;

  // E-3: Check credit balance before accepting the request
  if (account.credits < args.count) {
    const msg =
      `Insufficient credits. You have ${account.credits} credit(s) but requested ${args.count} appointment(s). ` +
      `Please purchase more credits to continue.`;
    return {
      isError: true,
      content: [{ type: "text" as const, text: msg }],
    };
  }

  // E-2: Merge stored account defaults with request params
  const industry = args.industry ?? (account.industry || undefined);
  const target_role = args.target_role ?? (account.target_role || undefined);

  const request_id = newId("req");
  const created_at = Date.now();

  const appointments = generateAppointments({
    request_id,
    count: args.count,
    target_role,
    date_range: args.date_range,
    industry,
  });

  // E-3: Deduct credits upfront (1 credit = 1 appointment)
  const { remaining } = deductCredits(api_key, args.count);

  putRequest({
    request_id,
    api_key,
    created_at,
    params: {
      location: args.location,
      count: args.count,
      industry,
      target_role,
      date_range: args.date_range,
      budget_per_appointment: args.budget_per_appointment,
      notes: args.notes,
    },
    appointments,
    credit_status: "reserved",
    credits_count: args.count,
  });

  const eta = new Date(created_at + ETA_HOURS * 60 * 60 * 1000).toISOString();
  const budget = args.budget_per_appointment ?? 100;
  const totalCap = budget * args.count;

  const summary =
    `Request received. Matching SDRs in ${args.location}` +
    (industry ? ` for ${industry}` : "") +
    (target_role ? ` (${target_role})` : "") +
    `. Targeting ${args.count} confirmed appointment${args.count > 1 ? "s" : ""} at up to $${budget}/each ($${totalCap} cap). ETA ${ETA_HOURS}h.` +
    ` Credits remaining: ${remaining}.`;

  const payload = {
    request_id,
    status: "processing" as const,
    estimated_completion: eta,
    credits_used: args.count,
    credits_remaining: remaining,
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
