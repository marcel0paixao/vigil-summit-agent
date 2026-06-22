import { apiRequest } from "@/shared/api/http";

export interface EngagementDashboard {
  registrations: Array<{ status: string; _count: { _all: number } }>;
  qualifications: Array<{ status: string; _count: { _all: number } }>;
  deliveredMessages: number;
  bookedMeetings: number;
  total: number;
  rates: { confirmation: number; attendance: number; meeting: number };
  attendanceTarget: number;
}

export function applyPublicEngagementAction(token: string) {
  return apiRequest<{ action: string; status: string; alreadyApplied: boolean }>(`/public/engagement/actions/${token}`, { method: "POST" });
}

export function updateRegistrationStatus(workspaceId: string, registrationId: string, status: string) {
  return apiRequest(`/workspaces/${workspaceId}/engagement/registrations/${registrationId}/status`, { method: "PATCH", body: { status } });
}

export function recordDemoInterest(workspaceId: string, registrationId: string) {
  return apiRequest(`/workspaces/${workspaceId}/engagement/interests`, { method: "POST", body: { registrationId, kind: "SESSION_ATTENDED", value: "AI security executive session", source: "OBSERVED", confidence: 1 } });
}

export function recordDemoReply(workspaceId: string, registrationId: string) {
  return apiRequest(`/workspaces/${workspaceId}/engagement/messages/inbound`, { method: "POST", body: { registrationId, body: "Gostaria de conversar e agendar uma reuniao.", providerMessageId: `demo-reply-${registrationId}` } });
}

export function bookDemoMeeting(workspaceId: string, registrationId: string) {
  const startsAt = new Date(Date.now() + 2 * 86_400_000); startsAt.setUTCHours(15, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  return apiRequest(`/workspaces/${workspaceId}/engagement/meetings`, { method: "POST", body: { registrationId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: "America/Sao_Paulo", provider: "demo-calendar", providerMeetingId: `demo-${registrationId}-${startsAt.toISOString()}` } });
}

export function getEngagementDashboard(workspaceId: string) {
  return apiRequest<EngagementDashboard>(`/workspaces/${workspaceId}/engagement/dashboard`);
}
