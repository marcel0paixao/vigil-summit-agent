import { WorkspaceRole } from "@prisma/client/index";

export interface AuthenticatedUser {
  sub: string;
  email: string;
  workspaceId?: string;
  role?: WorkspaceRole;
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
  workspaceMembership?: {
    workspaceId: string;
    role: WorkspaceRole;
  };
}
