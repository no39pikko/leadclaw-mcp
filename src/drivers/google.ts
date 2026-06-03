/**
 * GoogleCalendarDriver — books the meeting on Google Calendar. Reuses the
 * existing OAuth client from src/calendar/auth.ts (npm run admin google-auth).
 */
import { google } from "googleapis";
import type { CalendarDriver, CalendarEventInput } from "./types.js";
import type { ScheduleResult } from "../gtm/types.js";
import { getOAuth2Client } from "../calendar/auth.js";

export class GoogleCalendarDriver implements CalendarDriver {
  readonly name = "google-calendar";

  async schedule(input: CalendarEventInput): Promise<ScheduleResult> {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: "v3", auth });
    const start = new Date(input.when);
    const end = new Date(start.getTime() + (input.durationMinutes ?? 30) * 60 * 1000);

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return { eventId: res.data.id ?? "", htmlLink: res.data.htmlLink ?? "" };
  }
}
