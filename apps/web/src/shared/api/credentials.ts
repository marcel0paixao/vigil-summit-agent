import { apiRequest } from "@/shared/api/http";
import type { CredentialKind, CredentialType, IntegrationCredential } from "@/shared/api/types";

export interface CreateCredentialRequest {
  name: string;
  type: CredentialType;
  kind: CredentialKind;
  capabilities?: string[];
  value: string;
}

export function listCredentials(workspaceId: string) {
  return apiRequest<IntegrationCredential[]>(`/workspaces/${workspaceId}/credentials`);
}

export function createCredential(workspaceId: string, request: CreateCredentialRequest) {
  return apiRequest<IntegrationCredential>(`/workspaces/${workspaceId}/credentials`, {
    method: "POST",
    body: request
  });
}

export function deleteCredential(workspaceId: string, credentialId: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/workspaces/${workspaceId}/credentials/${credentialId}`,
    {
      method: "DELETE"
    }
  );
}
