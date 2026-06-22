export * from "./messaging.js";
export * from "./workflow-definition.js";

import { FLOWPILOT_ROUTING_KEYS } from "./messaging.js";

export type WorkflowExecutionRequested = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  executionId: string;
  requestedBy: {
    type: "user" | "system" | "webhook";
    id: string;
  };
  input: Record<string, unknown>;
  correlationId: string;
};

export type LeadEnrichmentRequested = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  leadId: string;
  registrationId: string;
  correlationId: string;
};

export type LeadEnrichmentCompleted = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  leadId: string;
  registrationId: string;
  snapshotId: string;
  provider: string;
  confidence: number;
  correlationId: string;
};

export type WorkflowCreated = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.workflowCreated;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  version: number;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  correlationId: string;
};

export type WorkflowExecutionStarted = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  correlationId: string;
};

export type NodeExecutionStarted = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  correlationId: string;
};

export type NodeExecutionCompleted = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  output: Record<string, unknown>;
  durationMs: number;
  correlationId: string;
};

export type NodeExecutionFailed = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  correlationId: string;
};

export type WorkflowExecutionCompleted = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  output: Record<string, unknown>;
  durationMs: number;
  correlationId: string;
};

export type WorkflowExecutionFailed = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  workflowId: string;
  executionId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  correlationId: string;
};

export type AiTraceCreated = {
  eventName: typeof FLOWPILOT_ROUTING_KEYS.aiTraceCreated;
  eventId: string;
  occurredAt: string;
  workspaceId: string;
  traceId: string;
  workflowId: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
    model: string;
    provider: string;
    latencyMs: number;
    providerLatencyMs?: number | null;
    finishReason?: string | null;
    tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  estimatedCostUsd?: number | null;
  status: "SUCCEEDED" | "FAILED";
  errorCode?: string | null;
  providerStatusCode?: number | null;
  retryable?: boolean | null;
  correlationId: string;
};

export type FlowPilotEvent =
  | WorkflowCreated
  | LeadEnrichmentRequested
  | LeadEnrichmentCompleted
  | WorkflowExecutionRequested
  | WorkflowExecutionStarted
  | NodeExecutionStarted
  | NodeExecutionCompleted
  | NodeExecutionFailed
  | WorkflowExecutionCompleted
  | WorkflowExecutionFailed
  | AiTraceCreated;

export const eventNames = [
  FLOWPILOT_ROUTING_KEYS.workflowCreated,
  FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
  FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
  FLOWPILOT_ROUTING_KEYS.aiTraceCreated
] as const;

export type FlowPilotEventName = (typeof eventNames)[number];
