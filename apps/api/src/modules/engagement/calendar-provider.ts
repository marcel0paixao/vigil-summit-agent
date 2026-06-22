import { randomUUID } from "node:crypto";

export type CalendarBookingInput = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  attendeeEmail: string;
};

export type CalendarBooking = { provider: string; providerMeetingId?: string; bookingUrl?: string };

export interface CalendarProvider {
  book(input: CalendarBookingInput): Promise<CalendarBooking>;
}

export class DemoCalendarProvider implements CalendarProvider {
  async book(): Promise<CalendarBooking> { return { provider: "demo-calendar" }; }
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly accessToken: string, private readonly calendarId: string) {
    if (!accessToken || !calendarId) throw new Error("Google Calendar requires an access token and calendar id");
  }

  async book(input: CalendarBookingInput): Promise<CalendarBooking> {
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ summary: input.title, start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone }, end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone }, attendees: [{ email: input.attendeeEmail }], conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } })
    });
    if (!response.ok) throw new Error(`Google Calendar request failed with status ${response.status}`);
    const payload = await response.json() as { id?: string; htmlLink?: string; hangoutLink?: string };
    if (!payload.id) throw new Error("Google Calendar response did not include an event id");
    return { provider: "google-calendar", providerMeetingId: payload.id, bookingUrl: payload.hangoutLink ?? payload.htmlLink };
  }
}

export function createCalendarProvider(environment: NodeJS.ProcessEnv = process.env): CalendarProvider {
  if ((environment.CALENDAR_PROVIDER ?? "demo") === "google") return new GoogleCalendarProvider(environment.GOOGLE_CALENDAR_ACCESS_TOKEN ?? "", environment.GOOGLE_CALENDAR_ID ?? "primary");
  return new DemoCalendarProvider();
}
