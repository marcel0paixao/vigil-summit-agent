import { apiRequest } from "@/shared/api/http";
import type { LeadDetail, LeadSummary } from "@/shared/api/types";

export function listLeads(workspaceId: string) {
  return apiRequest<LeadSummary[]>(`/workspaces/${workspaceId}/leads`);
}

export function getLead(workspaceId: string, leadId: string) {
  return apiRequest<LeadDetail>(`/workspaces/${workspaceId}/leads/${leadId}`);
}

export function exportLead(workspaceId: string, leadId: string) {
  return apiRequest<{ exportedAt: string; data: LeadDetail }>(`/workspaces/${workspaceId}/engagement/privacy/leads/${leadId}/export`);
}

export function withdrawLeadConsent(workspaceId: string, leadId: string) {
  return apiRequest<{ withdrawn: number }>(`/workspaces/${workspaceId}/engagement/privacy/leads/${leadId}/withdraw-consent`, { method: "POST", body: {} });
}
