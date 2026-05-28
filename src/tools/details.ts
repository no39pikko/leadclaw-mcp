import { z } from "zod/v3";
import { getAppointment } from "../db/store.js";

export const detailsInputShape = {
  appointment_id: z
    .string()
    .describe("The appointment_id returned from check_status."),
};

export async function getAppointmentDetailsHandler(args: { appointment_id: string }) {
  const apt = getAppointment(args.appointment_id);
  if (!apt) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `No appointment found with id ${args.appointment_id}.`,
        },
      ],
    };
  }

  const payload = {
    appointment_id: apt.appointment_id,
    contact_name: apt.contact_name,
    company: apt.company,
    company_size: apt.company_size,
    company_stage: apt.company_stage,
    role: apt.role,
    scheduled_at: apt.scheduled_at,
    meeting_link: apt.meeting_link,
    bant_score: apt.bant_score,
    sdr_notes: apt.sdr_notes,
  };

  const when = new Date(apt.scheduled_at).toUTCString();
  const text = [
    `${apt.contact_name} — ${apt.role} at ${apt.company} (${apt.company_size}, ${apt.company_stage})`,
    `When: ${when}`,
    `Meeting: ${apt.meeting_link}`,
    `Budget: ${apt.bant_score.budget}`,
    `Authority: ${apt.bant_score.authority}`,
    `Need: ${apt.bant_score.need}`,
    `Timeline: ${apt.bant_score.timeline}`,
    `SDR notes: ${apt.sdr_notes}`,
  ].join("\n");

  return {
    structuredContent: payload,
    content: [{ type: "text" as const, text }],
  };
}
