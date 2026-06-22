export const FLOWPILOT_EXCHANGES = {
  commands: "flowpilot.commands",
  events: "flowpilot.events",
  retry: "flowpilot.retry",
  dlx: "flowpilot.dlx"
} as const;

export const FLOWPILOT_ROUTING_KEYS = {
  workflowCreated: "workflow.created",
  leadEnrichmentRequested: "lead.enrichment.requested",
  leadEnrichmentCompleted: "lead.enrichment.completed",
  workflowExecutionRequested: "workflow.execution.requested",
  workflowExecutionStarted: "workflow.execution.started",
  nodeExecutionStarted: "workflow.node.execution.started",
  nodeExecutionCompleted: "workflow.node.execution.completed",
  nodeExecutionFailed: "workflow.node.execution.failed",
  workflowExecutionCompleted: "workflow.execution.completed",
  workflowExecutionFailed: "workflow.execution.failed",
  aiTraceCreated: "ai.trace.created"
} as const;

export const FLOWPILOT_QUEUES = {
  engagementWorkerLeadEnrichment: "flowpilot.engagement-worker.lead-enrichment",
  executionWorkerWorkflowExecutions: "flowpilot.execution-worker.workflow-executions",
  workflowServiceExecutionEvents: "flowpilot.workflow-service.execution-events",
  observabilityServiceAiTraces: "flowpilot.observability-service.ai-traces",
  observabilityServiceExecutionEvents: "flowpilot.observability-service.execution-events"
} as const;

export const FLOWPILOT_RETRY_QUEUES = {
  engagementWorkerLeadEnrichment10s: "flowpilot.retry.engagement-worker.lead-enrichment.10s",
  engagementWorkerLeadEnrichment1m: "flowpilot.retry.engagement-worker.lead-enrichment.1m",
  engagementWorkerLeadEnrichment5m: "flowpilot.retry.engagement-worker.lead-enrichment.5m",
  executionWorkerWorkflowExecutions10s: "flowpilot.retry.execution-worker.workflow-executions.10s",
  executionWorkerWorkflowExecutions1m: "flowpilot.retry.execution-worker.workflow-executions.1m",
  executionWorkerWorkflowExecutions5m: "flowpilot.retry.execution-worker.workflow-executions.5m"
} as const;

export const FLOWPILOT_RETRY_ROUTING_KEYS = {
  leadEnrichmentRequested10s: "lead.enrichment.requested.retry.10s",
  leadEnrichmentRequested1m: "lead.enrichment.requested.retry.1m",
  leadEnrichmentRequested5m: "lead.enrichment.requested.retry.5m",
  workflowExecutionRequested10s: "workflow.execution.requested.retry.10s",
  workflowExecutionRequested1m: "workflow.execution.requested.retry.1m",
  workflowExecutionRequested5m: "workflow.execution.requested.retry.5m"
} as const;

export const FLOWPILOT_DEAD_LETTER_QUEUES = {
  engagementWorkerLeadEnrichment: "flowpilot.dlq.engagement-worker.lead-enrichment",
  executionWorkerWorkflowExecutions: "flowpilot.dlq.execution-worker.workflow-executions",
  workflowServiceExecutionEvents: "flowpilot.dlq.workflow-service.execution-events",
  observabilityServiceAiTraces: "flowpilot.dlq.observability-service.ai-traces"
} as const;

export const FLOWPILOT_MESSAGE_PRODUCERS = {
  api: "api",
  engagementWorker: "engagement-worker",
  workflowService: "workflow-service",
  executionWorker: "execution-worker",
  aiOrchestrator: "ai-orchestrator",
  observabilityService: "observability-service"
} as const;

export const FLOWPILOT_RETRY_DELAYS = {
  first: "10s",
  second: "1m",
  third: "5m"
} as const;

export const FLOWPILOT_MAX_RETRY_ATTEMPTS = 3;

export const FLOWPILOT_MESSAGE_SCHEMA_VERSION = 1;

export type FlowPilotExchange =
  (typeof FLOWPILOT_EXCHANGES)[keyof typeof FLOWPILOT_EXCHANGES];

export type FlowPilotRoutingKey =
  (typeof FLOWPILOT_ROUTING_KEYS)[keyof typeof FLOWPILOT_ROUTING_KEYS];

export type FlowPilotQueue = (typeof FLOWPILOT_QUEUES)[keyof typeof FLOWPILOT_QUEUES];

export type FlowPilotRetryQueue =
  (typeof FLOWPILOT_RETRY_QUEUES)[keyof typeof FLOWPILOT_RETRY_QUEUES];

export type FlowPilotRetryRoutingKey =
  (typeof FLOWPILOT_RETRY_ROUTING_KEYS)[keyof typeof FLOWPILOT_RETRY_ROUTING_KEYS];

export type FlowPilotDeadLetterQueue =
  (typeof FLOWPILOT_DEAD_LETTER_QUEUES)[keyof typeof FLOWPILOT_DEAD_LETTER_QUEUES];

export type FlowPilotMessageProducer =
  (typeof FLOWPILOT_MESSAGE_PRODUCERS)[keyof typeof FLOWPILOT_MESSAGE_PRODUCERS];

export type FlowPilotRetryDelay =
  (typeof FLOWPILOT_RETRY_DELAYS)[keyof typeof FLOWPILOT_RETRY_DELAYS];

export type FlowPilotActor = {
  type: "user" | "system" | "webhook";
  id: string;
};

export type FlowPilotMessageEnvelope<
  TEventName extends FlowPilotRoutingKey,
  TPayload extends Record<string, unknown>
> = {
  eventName: TEventName;
  eventId: string;
  schemaVersion: typeof FLOWPILOT_MESSAGE_SCHEMA_VERSION;
  occurredAt: string;
  workspaceId: string;
  correlationId: string;
  causationId?: string;
  producer: FlowPilotMessageProducer;
  actor?: FlowPilotActor;
  idempotencyKey?: string;
  payload: TPayload;
};

export type WorkflowCreatedPayload = {
  workflowId: string;
  workflowVersionId: string;
  version: number;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

export type WorkflowExecutionRequestedPayload = {
  workflowId: string;
  workflowVersion: number;
  executionId: string;
  requestedBy: FlowPilotActor;
  input: Record<string, unknown>;
};

export type LeadEnrichmentRequestedPayload = {
  eventId: string;
  leadId: string;
  registrationId: string;
};

export type LeadEnrichmentCompletedPayload = {
  eventId: string;
  leadId: string;
  registrationId: string;
  snapshotId: string;
  provider: string;
  confidence: number;
};

export type WorkflowExecutionStartedPayload = {
  workflowId: string;
  executionId: string;
};

export type NodeExecutionStartedPayload = {
  workflowId: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  nodeType: string;
  input: Record<string, unknown>;
};

export type NodeExecutionCompletedPayload = {
  workflowId: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  nodeType: string;
  output: Record<string, unknown>;
  durationMs: number;
};

export type FlowPilotExecutionError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type NodeExecutionFailedPayload = {
  workflowId: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  nodeType: string;
  error: FlowPilotExecutionError;
};

export type WorkflowExecutionCompletedPayload = {
  workflowId: string;
  executionId: string;
  output: Record<string, unknown>;
  durationMs: number;
};

export type WorkflowExecutionFailedPayload = {
  workflowId: string;
  executionId: string;
  error: FlowPilotExecutionError;
};

export type AiTraceCreatedPayload = {
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
};

export type WorkflowCreatedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.workflowCreated,
  WorkflowCreatedPayload
>;

export type WorkflowExecutionRequestedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
  WorkflowExecutionRequestedPayload
>;

export type LeadEnrichmentRequestedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
  LeadEnrichmentRequestedPayload
>;

export type LeadEnrichmentCompletedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted,
  LeadEnrichmentCompletedPayload
>;

export type WorkflowExecutionStartedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
  WorkflowExecutionStartedPayload
>;

export type NodeExecutionStartedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
  NodeExecutionStartedPayload
>;

export type NodeExecutionCompletedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
  NodeExecutionCompletedPayload
>;

export type NodeExecutionFailedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed,
  NodeExecutionFailedPayload
>;

export type WorkflowExecutionCompletedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
  WorkflowExecutionCompletedPayload
>;

export type WorkflowExecutionFailedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
  WorkflowExecutionFailedPayload
>;

export type AiTraceCreatedMessage = FlowPilotMessageEnvelope<
  typeof FLOWPILOT_ROUTING_KEYS.aiTraceCreated,
  AiTraceCreatedPayload
>;

export type FlowPilotMessage =
  | WorkflowCreatedMessage
  | LeadEnrichmentRequestedMessage
  | LeadEnrichmentCompletedMessage
  | WorkflowExecutionRequestedMessage
  | WorkflowExecutionStartedMessage
  | NodeExecutionStartedMessage
  | NodeExecutionCompletedMessage
  | NodeExecutionFailedMessage
  | WorkflowExecutionCompletedMessage
  | WorkflowExecutionFailedMessage
  | AiTraceCreatedMessage;
