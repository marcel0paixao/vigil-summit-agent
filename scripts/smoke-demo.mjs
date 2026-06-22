const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const email = `smoke-${Date.now()}@vigil-smoke.test`;

const login = await request("POST", "/auth/login", { email: "demo-admin@vigil.test", password: "VigilDemo2026!ChangeMe" });
const token = login.accessToken;
const workspaceId = login.workspace.id;
const events = await request("GET", `/workspaces/${workspaceId}/events`, undefined, token);
const event = events.find((item) => item.status === "PUBLISHED" || item.status === "LIVE");
if (!event) throw new Error("No public event is available for the smoke journey");

const registration = await request("POST", `/public/events/${event.id}/registrations`, {
  fullName: "Smoke Persona (Demo)", workEmail: email, jobTitle: "CISO", companyName: "Vigil Smoke",
  companyDomain: "vigil-smoke.test", interestTopics: ["AI governance"], privacyNoticeVersion: "2026-06-21",
  eventCommunicationConsent: true, commercialFollowUpConsent: true
});

await waitFor(async () => {
  const lead = await request("GET", `/workspaces/${workspaceId}/leads/${registration.leadId}`, undefined, token);
  return lead.qualifications.length > 0;
});
await request("PATCH", `/workspaces/${workspaceId}/engagement/registrations/${registration.registrationId}/status`, { status: "CONFIRMED" }, token);
await request("PATCH", `/workspaces/${workspaceId}/engagement/registrations/${registration.registrationId}/status`, { status: "ATTENDED" }, token);
await request("POST", `/workspaces/${workspaceId}/engagement/interests`, { registrationId: registration.registrationId, kind: "SESSION_ATTENDED", value: "AI security session", source: "OBSERVED", confidence: 1 }, token);
await request("POST", `/workspaces/${workspaceId}/engagement/messages/inbound`, { registrationId: registration.registrationId, body: "Quero agendar uma reuniao.", providerMessageId: `smoke-reply-${registration.registrationId}` }, token);
const startsAt = new Date(Date.now() + 10 * 86_400_000); startsAt.setUTCHours(14, 0, 0, 0);
const meeting = await request("POST", `/workspaces/${workspaceId}/engagement/meetings`, { registrationId: registration.registrationId, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(), timezone: "America/Sao_Paulo", provider: "demo-calendar", providerMeetingId: `smoke-${registration.registrationId}` }, token);
if (meeting.status !== "BOOKED") throw new Error("Smoke meeting was not booked");
const dashboard = await request("GET", `/workspaces/${workspaceId}/engagement/dashboard?eventId=${event.id}`, undefined, token);
console.log(JSON.stringify({ status: "ok", eventId: event.id, registrationId: registration.registrationId, meetingId: meeting.id, totalRegistrations: dashboard.total }, null, 2));

async function request(method, path, body, accessToken) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 1_000)); }
  throw new Error("Timed out waiting for asynchronous enrichment");
}
