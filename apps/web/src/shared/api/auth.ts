import { apiRequest } from "@/shared/api/http";
import type { LoginResponse, MeResponse } from "@/shared/api/types";

export interface LoginRequest {
  email: string;
  password: string;
  workspaceId?: string;
}

export function login(request: LoginRequest) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: request
  });
}

export function getCurrentUser() {
  return apiRequest<MeResponse>("/auth/me");
}
