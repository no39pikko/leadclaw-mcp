import { google } from "googleapis";
import { getOAuth2Client } from "./auth.js";
import type { AppointmentRecord } from "../db/store.js";

export async function addAppointmentToCalendar(
  appointment: AppointmentRecord
): Promise<{ eventId: string; htmlLink: string }> {
  const auth = getOAuth2Client();
  const calendar = google.calendar({ version: "v3", auth });

  const start = new Date(appointment.scheduled_at);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min

  const description = [
    `👤 ${appointment.contact_name} — ${appointment.role}`,
    `🏢 ${appointment.company} (${appointment.company_stage}, ${appointment.company_size})`,
    ``,
    `📋 BANT:`,
    `  Budget:    ${appointment.bant_score.budget}`,
    `  Authority: ${appointment.bant_score.authority}`,
    `  Need:      ${appointment.bant_score.need}`,
    `  Timeline:  ${appointment.bant_score.timeline}`,
    ``,
    `📝 SDR Notes: ${appointment.sdr_notes}`,
    ``,
    `🔗 Meeting: ${appointment.meeting_link}`,
    ``,
    `— LeadClaw`,
  ].join("\n");

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: `[LeadClaw] ${appointment.contact_name} / ${appointment.company}`,
      description,
      location: appointment.meeting_link,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return {
    eventId: res.data.id ?? "",
    htmlLink: res.data.htmlLink ?? "",
  };
}
