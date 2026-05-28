import { z } from "zod/v3";
import { requireAuth, authErrorResponse } from "../auth.js";
import { getAppointment } from "../db/store.js";
import { addAppointmentToCalendar } from "../calendar/client.js";
import { hasCredentials, isAuthorized } from "../calendar/auth.js";

export const calendarInputShape = {
  appointment_id: z
    .string()
    .describe(
      "The appointment_id to add to Google Calendar (from check_status or get_appointment_details)."
    ),
};

export async function addToCalendarTool(args: { appointment_id: string }) {
  // 1. LeadClaw API key auth
  try {
    requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  // 2. Google credentials check
  if (!hasCredentials()) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Google Calendar is not configured. Contact your LeadClaw administrator.",
        },
      ],
      isError: true,
    };
  }

  // 3. Google OAuth token check
  if (!isAuthorized()) {
    return {
      content: [
        {
          type: "text" as const,
          text: [
            "Google Calendar is not yet authorized.",
            "Please run the following command in your terminal:",
            "",
            "  npm run admin google-auth",
            "",
            "Then try this request again.",
          ].join("\n"),
        },
      ],
      isError: true,
    };
  }

  // 4. Find appointment
  const appointment = getAppointment(args.appointment_id);
  if (!appointment) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Appointment not found: ${args.appointment_id}`,
        },
      ],
      isError: true,
    };
  }

  // 5. Add to Google Calendar
  try {
    const result = await addAppointmentToCalendar(appointment);
    const when = new Date(appointment.scheduled_at).toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `✅ Added to Google Calendar:`,
            `   ${appointment.contact_name} — ${appointment.role} at ${appointment.company}`,
            `   ${when}`,
            `   View: ${result.htmlLink}`,
          ].join("\n"),
        },
      ],
      structuredContent: {
        event_id: result.eventId,
        html_link: result.htmlLink,
        appointment_id: appointment.appointment_id,
        contact_name: appointment.contact_name,
        company: appointment.company,
        scheduled_at: appointment.scheduled_at,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: `Google Calendar error: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}
