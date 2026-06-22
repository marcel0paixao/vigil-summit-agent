import { apiRequest } from "@/shared/api/http";
import type { Workspace, WorkspaceMember } from "@/shared/api/types";

export interface CreateWorkspaceRequest {
  name: string;
  slug: string;
}

export function listWorkspaces() {
  return apiRequest<Workspace[]>("/workspaces");
}

export function getWorkspace(workspaceId: string) {
  return apiRequest<Workspace>(`/workspaces/${workspaceId}`);
}

export function createWorkspace(request: CreateWorkspaceRequest) {
  return apiRequest<Workspace>("/workspaces", {
    method: "POST",
    body: request
  });
}

export function listWorkspaceMembers(workspaceId: string) {
  return apiRequest<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
}
