import { apiRequest } from "@/shared/api/http";
import type { EventRegistrationResponse, ManagedEvent, PublicEvent } from "@/shared/api/types";

export interface RegisterForEventRequest {
  fullName: string;
  workEmail: string;
  jobTitle?: string;
  companyName: string;
  companyDomain?: string;
  interestTopics?: string[];
  privacyNoticeVersion: string;
  eventCommunicationConsent: true;
  commercialFollowUpConsent: boolean;
}

export function getPublicEvent(eventId: string) {
  return apiRequest<PublicEvent>(`/public/events/${eventId}`);
}

export function registerForEvent(eventId: string, request: RegisterForEventRequest) {
  return apiRequest<EventRegistrationResponse>(`/public/events/${eventId}/registrations`, {
    method: "POST",
    body: request
  });
}

export function listEvents(workspaceId: string) {
  return apiRequest<ManagedEvent[]>(`/workspaces/${workspaceId}/events`);
}

export function transitionEvent(workspaceId: string, eventId: string, action: "publish" | "start" | "complete" | "cancel") {
  return apiRequest<ManagedEvent>(`/workspaces/${workspaceId}/events/${eventId}/${action}`, { method: "PATCH" });
}
