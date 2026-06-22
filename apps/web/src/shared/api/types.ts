import type { WorkflowDefinition } from "@flowpilot/contracts";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type WorkflowExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type WorkflowNodeExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
export type OutboxMessageStatus = "PENDING" | "PUBLISHED" | "FAILED";
export type AiTraceStatus = "SUCCEEDED" | "FAILED";
export type CredentialType = "openrouter" | "ollama" | "openai" | "claude" | "gemini";
export type CredentialKind = "llm" | "database" | "search" | "webhook" | "email";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface UserProfile extends User {
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  members: WorkspaceMember[];
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  user: UserProfile;
}

export interface CurrentUserMembership {
  role: WorkspaceRole;
  workspace: Omit<Workspace, "members">;
}

export interface CurrentUser extends UserProfile {
  memberships: CurrentUserMembership[];
}

export interface IntegrationCredential {
  id: string;
  workspaceId: string;
  name: string;
  type: CredentialType;
  kind: CredentialKind;
  capabilities: string[];
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  workspace: {
    id: string;
    role: WorkspaceRole;
  } | null;
}

export interface MeResponse {
  user: CurrentUser;
}

export interface WorkflowVersion {
  id: string;
  version: number;
  definition: WorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  status: WorkflowStatus;
  currentVersion: WorkflowVersion;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  requestedByUserId: string | null;
  status: WorkflowExecutionStatus;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNodeExecution {
  id: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  status: WorkflowNodeExecutionStatus;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionEvent {
  id: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  eventName: string;
  eventId: string;
  occurredAt: string;
  producer: string;
  payload: unknown;
  createdAt: string;
}

export interface WorkflowAiTrace {
  id: string;
  workspaceId: string;
  workflowId: string | null;
  workflowExecutionId: string | null;
  nodeExecutionId: string | null;
  nodeId: string | null;
  credentialId: string | null;
  provider: string;
  model: string;
  status: AiTraceStatus;
  latencyMs: number;
  providerLatencyMs: number | null;
  finishReason: string | null;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  estimatedCostUsd: string | null;
  inputSizeBytes: number | null;
  outputSizeBytes: number | null;
  schemaValid: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  providerStatusCode: number | null;
  retryable: boolean | null;
  createdAt: string;
}

export interface WorkflowExecutionSummary {
  execution: WorkflowExecution;
  nodes: WorkflowNodeExecution[];
  events: WorkflowExecutionEvent[];
  aiTraces: WorkflowAiTrace[];
}

export interface WorkflowExecutionDiagnostics {
  retry: {
    attempts: number;
    deadLettered: boolean;
    lastFailureCode: string | null;
    lastFailureMessage: string | null;
    retryable: boolean | null;
  };
  outbox: Array<{
    id: string;
    eventName: string;
    status: OutboxMessageStatus;
    attempts: number;
    exchange: string;
    routingKey: string;
    lastError: string | null;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "LIVE" | "COMPLETED" | "CANCELLED";
export type RegistrationStatus =
  | "REGISTERED"
  | "WAITLISTED"
  | "CONFIRMED"
  | "DECLINED"
  | "ATTENDED"
  | "NO_SHOW";

export interface PublicEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  capacity: number;
  status: Extract<EventStatus, "PUBLISHED" | "LIVE">;
}

export interface ManagedEvent extends Omit<PublicEvent, "status"> {
  status: EventStatus;
}

export interface EventRegistrationResponse {
  created: boolean;
  registrationId: string;
  leadId: string;
  status: RegistrationStatus;
}

export type QualificationStatus = "QUALIFIED" | "REVIEW" | "DISQUALIFIED";

export interface LeadSummary {
  id: string;
  fullName: string;
  workEmail: string;
  jobTitle: string | null;
  companyName: string;
  companyDomain: string | null;
  suppressedAt: string | null;
  createdAt: string;
  registrations: Array<{
    id: string;
    eventId: string;
    status: RegistrationStatus;
    registeredAt: string;
    qualification: {
      status: QualificationStatus;
      score: number;
      reasonCodes: string[];
      policyVersion: string;
    } | null;
  }>;
}

export interface LeadDetail extends Omit<LeadSummary, "registrations"> {
  registrations: Array<LeadSummary["registrations"][number] & { event: PublicEvent; interestTopics: string[] }>;
  consentRecords: Array<{ id: string; purpose: string; channel: string; grantedAt: string; withdrawnAt: string | null }>;
  enrichmentSnapshots: Array<{ id: string; provider: string; status: string; companyIndustry: string | null; companyEmployeeRange: string | null; confidence: number | null; evidence: unknown }>;
  interestSignals: Array<{ id: string; source: string; kind: string; value: string; confidence: number; occurredAt: string }>;
  conversations: Array<{ id: string; status: string; messages: Array<{ id: string; direction: string; status: string; subject: string | null; body: string; createdAt: string }> }>;
  agentDecisions: Array<{ id: string; action: string; status: string; reasonCodes: string[]; rationale: string; model: string | null; createdAt: string }>;
  meetings: Array<{ id: string; status: string; startsAt: string | null; timezone: string | null; provider: string | null }>;
  suppressions: Array<{ id: string; purpose: string; channel: string; reason: string }>;
}
