import { readConfig } from "@flowpilot/config";
import {
  FLOWPILOT_DEAD_LETTER_QUEUES,
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MAX_RETRY_ATTEMPTS,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_QUEUES,
  FLOWPILOT_RETRY_QUEUES,
  FLOWPILOT_RETRY_ROUTING_KEYS,
  FLOWPILOT_ROUTING_KEYS,
  WORKFLOW_NODE_TYPES,
  type AiTraceCreatedMessage,
  type FlowPilotExecutionError,
  type NodeExecutionCompletedMessage,
  type NodeExecutionFailedMessage,
  type NodeExecutionStartedMessage,
  type WorkflowDefinition,
  type WorkflowExecutionCompletedMessage,
  type WorkflowExecutionFailedMessage,
  type WorkflowExecutionRequestedMessage,
  type WorkflowExecutionStartedMessage,
  workflowDefinitionSchema,
  type WorkflowNode
} from "@flowpilot/contracts";
import { createLogger } from "@flowpilot/logger";
import { Prisma, PrismaClient } from "@prisma/client/index";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  AiOrchestratorClient,
  AiOrchestratorClientError
} from "./ai-orchestrator-client.js";
import { WorkflowExecutionWorkerError } from "./errors.js";
import {
  declareLeadEnrichmentTopology,
  handleLeadEnrichmentDelivery
} from "./enrichment/lead-enrichment-consumer.js";
import { createEnrichmentProvider } from "./enrichment/enrichment-provider-factory.js";
import { startScheduledActionDispatcher } from "./engagement/scheduled-action-dispatcher.js";
import { executeWorkflowNode } from "./nodes/index.js";

const logger = createLogger("execution-worker", "debug");

const retryAttemptHeader = "x-flowpilot-retry-attempt";
const failureSimulationInputKey = "__flowpilotSimulateFailure";
const outboxDispatcherBatchSize = 25;
const outboxDispatcherIntervalMs = 5_000;
const outboxMaxPublishAttempts = 5;

const retryQueueConfig = [
  {
    queue: FLOWPILOT_RETRY_QUEUES.executionWorkerWorkflowExecutions10s,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.workflowExecutionRequested10s,
    ttlMs: 10_000
  },
  {
    queue: FLOWPILOT_RETRY_QUEUES.executionWorkerWorkflowExecutions1m,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.workflowExecutionRequested1m,
    ttlMs: 60_000
  },
  {
    queue: FLOWPILOT_RETRY_QUEUES.executionWorkerWorkflowExecutions5m,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.workflowExecutionRequested5m,
    ttlMs: 300_000
  }
] as const;

type WorkerResources = {
  channel: Channel;
  connection: ChannelModel;
  outboxDispatcher: ReturnType<typeof setInterval>;
  scheduledActionDispatcher: ReturnType<typeof setInterval>;
  prisma: PrismaClient;
};

type ExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type WorkerFailure = FlowPilotExecutionError & {
  cause?: unknown;
};

type WorkflowLifecycleRoutingKey =
  | typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted
  | typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted
  | typeof FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed
  | typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted
  | typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted
  | typeof FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed
  | typeof FLOWPILOT_ROUTING_KEYS.aiTraceCreated;

type WorkflowLifecycleMessage =
  | WorkflowExecutionStartedMessage
  | WorkflowExecutionCompletedMessage
  | WorkflowExecutionFailedMessage
  | NodeExecutionStartedMessage
  | NodeExecutionCompletedMessage
  | NodeExecutionFailedMessage
  | AiTraceCreatedMessage;

type PrismaWriter = PrismaClient | Prisma.TransactionClient;

type WorkflowAiTraceCreateData = {
  workspaceId: string;
  workflowId: string;
  workflowExecutionId: string;
  nodeExecutionId: string;
  nodeId: string;
  credentialId: string | null;
  provider: string;
  model: string;
  status: "SUCCEEDED" | "FAILED";
  latencyMs: number;
  providerLatencyMs?: number | null;
  finishReason?: string | null;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  estimatedCostUsd?: number | null;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
  schemaValid?: boolean | null;
  errorCode?: string;
  errorMessage?: string;
  providerStatusCode?: number | null;
  retryable?: boolean;
};

type WorkflowAiTraceEventRecord = WorkflowAiTraceCreateData & {
  id: string;
  createdAt: Date;
};

type AiTracePrismaWriter = PrismaWriter & {
  workflowAiTrace: {
    create(args: { data: WorkflowAiTraceCreateData }): Promise<{ id: string; createdAt: Date }>;
  };
};

type WorkflowExecutionWithVersion = NonNullable<
  Awaited<ReturnType<typeof findWorkflowExecutionForProcessing>>
>;

export async function startWorker(): Promise<WorkerResources> {
  const runtimeConfig = readConfig();
  const aiOrchestratorClient = new AiOrchestratorClient(
    runtimeConfig.aiOrchestratorUrl,
    runtimeConfig.aiOrchestratorTimeoutMs
  );
  const enrichmentProvider = createEnrichmentProvider();
  const prisma = new PrismaClient();
  const connection = await connect(runtimeConfig.rabbitmqUrl);
  const channel = await connection.createChannel();

  await declareTopology(channel);
  await channel.prefetch(1);

  await channel.consume(FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions, async (message) => {
    if (!message) {
      return;
    }

    await handleDelivery(message, channel, prisma, aiOrchestratorClient);
  });

  await channel.consume(FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment, async (message) => {
    if (!message) {
      return;
    }

    await handleLeadEnrichmentDelivery(message, channel, prisma, enrichmentProvider);
  });

  const outboxDispatcher = startOutboxDispatcher(channel, prisma);
  const scheduledActionDispatcher = startScheduledActionDispatcher(prisma);

  logger.info("Execution worker started", {
    queues: [
      FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions,
      FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment
    ]
  });

  return {
    channel,
    connection,
    outboxDispatcher,
    scheduledActionDispatcher,
    prisma
  };
}

function startOutboxDispatcher(
  channel: Channel,
  prisma: PrismaClient
): ReturnType<typeof setInterval> {
  const dispatch = async () => {
    try {
      const result = await dispatchPendingOutboxMessages(channel, prisma);

      if (result.published > 0 || result.failed > 0) {
        logger.info("Outbox dispatch cycle completed", result);
      }
    } catch (error) {
      logger.error("Outbox dispatch cycle failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  void dispatch();

  const timer = setInterval(() => {
    void dispatch();
  }, outboxDispatcherIntervalMs);
  timer.unref();

  return timer;
}

export async function handleDelivery(
  message: ConsumeMessage,
  channel: Channel,
  prisma: PrismaClient,
  aiOrchestratorClient: AiOrchestratorClient
): Promise<void> {
  const parsedMessage = parseWorkflowExecutionRequestedMessage(message);

  if (!parsedMessage) {
    logger.warn("Rejecting invalid workflow execution request", {
      routingKey: message.fields.routingKey
    });
    await publishRawDeadLetter(channel, message, "invalid_payload");
    channel.ack(message);
    return;
  }

  try {
    await processWorkflowExecution(parsedMessage, channel, prisma, aiOrchestratorClient);
    channel.ack(message);
  } catch (error) {
    const failure = normalizeWorkerFailure(error);
    const currentRetryAttempt = getWorkflowExecutionRetryAttempt(message);

    logger.error("Workflow execution processing failed", {
      error: failure.message,
      executionId: parsedMessage.payload.executionId
    });

    if (failure.retryable && currentRetryAttempt < FLOWPILOT_MAX_RETRY_ATTEMPTS) {
      await publishRetryCommand(channel, parsedMessage, currentRetryAttempt + 1);
      channel.ack(message);
      return;
    }

    try {
      await failWorkflowExecution(parsedMessage, channel, prisma, failure);
      await publishCommandDeadLetter(channel, parsedMessage, failure, currentRetryAttempt);
      channel.ack(message);
    } catch (terminalFailureError) {
      logger.error("Failed to persist terminal workflow execution failure", {
        error:
          terminalFailureError instanceof Error
            ? terminalFailureError.message
            : String(terminalFailureError),
        executionId: parsedMessage.payload.executionId
      });
      channel.nack(message, false, true);
    }
  }
}

export async function processWorkflowExecution(
  message: WorkflowExecutionRequestedMessage,
  channel: Channel,
  prisma: PrismaClient,
  aiOrchestratorClient: AiOrchestratorClient
): Promise<void> {
  const startedAt = new Date();
  const existingExecution = await findWorkflowExecutionForProcessing(
    prisma,
    message.payload.executionId
  );

  if (!existingExecution) {
    throw new WorkflowExecutionWorkerError("workflow_execution_not_found", "Workflow execution was not found", false);
  }

  if (isTerminalExecutionStatus(existingExecution.status)) {
    logger.info("Skipping workflow execution because it is already terminal", {
      executionId: existingExecution.id,
      status: existingExecution.status
    });
    await dispatchPendingWorkflowExecutionOutboxMessages(channel, prisma, existingExecution.id);
    return;
  }

  let execution: WorkflowExecutionWithVersion = existingExecution;
  const effectiveStartedAt = existingExecution.startedAt ?? startedAt;

  if (existingExecution.status === "PENDING") {
    const startedMessage = createWorkflowExecutionStartedMessage(
      message,
      effectiveStartedAt.toISOString()
    );
    const transition = await prisma.$transaction(async (tx) => {
      const update = await tx.workflowExecution.updateMany({
        where: {
          id: message.payload.executionId,
          status: "PENDING"
        },
        data: {
          status: "RUNNING",
          startedAt: effectiveStartedAt
        }
      });

      if (update.count === 0) {
        return {
          update
        };
      }

      const outboxMessage = await persistOutboxEvent(
        tx,
        FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
        startedMessage
      );

      return {
        update,
        outboxMessage
      };
    });

    if (transition.update.count === 0) {
      const currentExecution = await findWorkflowExecutionForProcessing(
        prisma,
        message.payload.executionId
      );

      if (!currentExecution || isTerminalExecutionStatus(currentExecution.status)) {
        logger.info("Skipping workflow execution after concurrent state transition", {
          executionId: message.payload.executionId,
          status: currentExecution?.status ?? "MISSING"
        });
        await dispatchPendingWorkflowExecutionOutboxMessages(
          channel,
          prisma,
          message.payload.executionId
        );
        return;
      }

      execution = currentExecution;
    } else {
      execution = {
        ...existingExecution,
        status: "RUNNING",
        startedAt: effectiveStartedAt
      };
      if (!transition.outboxMessage) {
        throw new WorkflowExecutionWorkerError(
          "workflow_execution_started_outbox_missing",
          "Workflow execution started outbox message was not created",
          true
        );
      }
      await dispatchOutboxEvent(channel, prisma, transition.outboxMessage);
    }
  } else {
    const startedOutboxMessage = await persistOutboxEvent(
      prisma,
      FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
      createWorkflowExecutionStartedMessage(message, effectiveStartedAt.toISOString())
    );
    await dispatchOutboxEvent(channel, prisma, startedOutboxMessage);
  }

  const output = await executeWorkflowNodes(
    message,
    channel,
    prisma,
    execution,
    aiOrchestratorClient
  );
  const completedAt = new Date();
  const completedMessage = createWorkflowExecutionCompletedMessage(
    message,
    output,
    effectiveStartedAt,
    completedAt
  );
  const completion = await prisma.$transaction(async (tx) => {
    const update = await tx.workflowExecution.updateMany({
      where: {
        id: execution.id,
        status: "RUNNING"
      },
      data: {
        status: "SUCCEEDED",
        output: output as Prisma.InputJsonObject,
        completedAt
      }
    });

    if (update.count === 0) {
      return {
        update
      };
    }

    const outboxMessage = await persistOutboxEvent(
      tx,
      FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
      completedMessage
    );

    return {
      update,
      outboxMessage
    };
  });

  if (completion.update.count === 0) {
    const currentExecution = await prisma.workflowExecution.findUnique({
      where: {
        id: execution.id
      }
    });

    if (currentExecution && isTerminalExecutionStatus(currentExecution.status)) {
      logger.info("Skipping completion event because workflow execution is already terminal", {
        executionId: execution.id,
        status: currentExecution.status
      });
      await dispatchPendingWorkflowExecutionOutboxMessages(channel, prisma, execution.id);
      return;
    }

    throw new WorkflowExecutionWorkerError(
      "workflow_execution_completion_conflict",
      "Workflow execution could not be completed from RUNNING state",
      true
    );
  }

  if (!completion.outboxMessage) {
    throw new WorkflowExecutionWorkerError(
      "workflow_execution_completed_outbox_missing",
      "Workflow execution completed outbox message was not created",
      true
    );
  }

  await dispatchOutboxEvent(channel, prisma, completion.outboxMessage);

  logger.info("Workflow execution completed", {
    executionId: execution.id,
    workflowId: execution.workflowId,
    workspaceId: execution.workspaceId
  });
}

export function parseWorkflowExecutionRequestedMessage(
  message: ConsumeMessage
): WorkflowExecutionRequestedMessage | null {
  let payload: unknown;

  try {
    payload = JSON.parse(message.content.toString("utf8"));
  } catch {
    return null;
  }

  if (!isWorkflowExecutionRequestedMessage(payload)) {
    return null;
  }

  return payload;
}

function isWorkflowExecutionRequestedMessage(
  value: unknown
): value is WorkflowExecutionRequestedMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.eventName !== FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested ||
    typeof value.eventId !== "string" ||
    value.schemaVersion !== FLOWPILOT_MESSAGE_SCHEMA_VERSION ||
    typeof value.occurredAt !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.correlationId !== "string" ||
    value.producer !== FLOWPILOT_MESSAGE_PRODUCERS.api ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  const payload = value.payload;

  return (
    typeof payload.workflowId === "string" &&
    typeof payload.workflowVersion === "number" &&
    typeof payload.executionId === "string" &&
    isRecord(payload.requestedBy) &&
    payload.requestedBy.type === "user" &&
    typeof payload.requestedBy.id === "string" &&
    isRecord(payload.input)
  );
}

function createWorkflowExecutionStartedMessage(
  message: WorkflowExecutionRequestedMessage,
  occurredAt: string
): WorkflowExecutionStartedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt,
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.execution.started:${message.payload.executionId}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId
    }
  };
}

function createWorkflowExecutionCompletedMessage(
  message: WorkflowExecutionRequestedMessage,
  output: Record<string, unknown>,
  startedAt: Date,
  completedAt: Date
): WorkflowExecutionCompletedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: completedAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.execution.completed:${message.payload.executionId}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      output,
      durationMs: completedAt.getTime() - startedAt.getTime()
    }
  };
}

function createWorkflowExecutionFailedMessage(
  message: WorkflowExecutionRequestedMessage,
  error: FlowPilotExecutionError,
  occurredAt: Date
): WorkflowExecutionFailedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: occurredAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.execution.failed:${message.payload.executionId}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      error
    }
  };
}

async function findWorkflowExecutionForProcessing(prisma: PrismaClient, executionId: string) {
  return prisma.workflowExecution.findUnique({
    where: {
      id: executionId
    },
    include: {
      workflowVersion: true
    }
  });
}

async function executeWorkflowNodes(
  message: WorkflowExecutionRequestedMessage,
  channel: Channel,
  prisma: PrismaClient,
  execution: WorkflowExecutionWithVersion,
  aiOrchestratorClient: AiOrchestratorClient
): Promise<Record<string, unknown>> {
  assertNoSimulatedWorkflowFailure(message);

  const definition = parseWorkflowDefinition(execution.workflowVersion.definition);
  const orderedNodes = orderWorkflowNodes(definition);
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  let currentInput = message.payload.input;

  for (const node of orderedNodes) {
    const input = getNodeInput(node, definition, nodeOutputs, currentInput);
    const startedAt = new Date();
    const nodeExecution = await upsertRunningNodeExecution(
      prisma,
      message,
      node,
      input,
      startedAt
    );
    await publishNodeStartedEvent(channel, prisma, message, node, nodeExecution.id, input, startedAt);

    try {
      const output = await executeNode({
        node,
        input,
        message,
        nodeExecutionId: nodeExecution.id,
        aiOrchestratorClient
      });
      const completedAt = new Date();
      await completeNodeExecution(prisma, nodeExecution.id, output, completedAt);
      await recordAiTraceForSuccessfulNode(
        channel,
        prisma,
        message,
        node,
        nodeExecution.id,
        input,
        output,
        startedAt,
        completedAt
      );
      await publishNodeCompletedEvent(
        channel,
        prisma,
        message,
        node,
        nodeExecution.id,
        output,
        startedAt,
        completedAt
      );
      logger.info("Workflow node execution completed", {
        durationMs: completedAt.getTime() - startedAt.getTime(),
        executionId: execution.id,
        nodeExecutionId: nodeExecution.id,
        nodeId: node.id,
        nodeType: node.type,
        workflowId: execution.workflowId,
        workspaceId: execution.workspaceId
      });
      nodeOutputs.set(node.id, output);
      currentInput = output;
    } catch (error) {
      const failure = normalizeWorkerFailure(error);
      const failedAt = new Date();
      await failNodeExecution(prisma, nodeExecution.id, failure, failedAt);
      await recordAiTraceForFailedNode(
        channel,
        prisma,
        message,
        node,
        nodeExecution.id,
        input,
        failure,
        startedAt,
        failedAt
      );
      await publishNodeFailedEvent(channel, prisma, message, node, nodeExecution.id, failure, failedAt);
      logger.error("Workflow node execution failed", {
        code: failure.code,
        durationMs: failedAt.getTime() - startedAt.getTime(),
        error: failure.message,
        executionId: execution.id,
        nodeExecutionId: nodeExecution.id,
        nodeId: node.id,
        nodeType: node.type,
        retryable: failure.retryable,
        workflowId: execution.workflowId,
        workspaceId: execution.workspaceId
      });
      throw error;
    }
  }

  return {
    status: "ok",
    nodeCount: orderedNodes.length,
    finalOutput: currentInput,
    processedBy: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
  };
}

function assertNoSimulatedWorkflowFailure(message: WorkflowExecutionRequestedMessage): void {
  const simulatedFailure = message.payload.input[failureSimulationInputKey];

  if (process.env.FLOWPILOT_ENABLE_WORKER_FAILURE_SIMULATION === "true") {
    if (simulatedFailure === "retryable") {
      throw new WorkflowExecutionWorkerError(
        "workflow_execution_simulated_retryable_failure",
        "Simulated retryable workflow execution failure",
        true
      );
    }

    if (simulatedFailure === "non_retryable") {
      throw new WorkflowExecutionWorkerError(
        "workflow_execution_simulated_non_retryable_failure",
        "Simulated non-retryable workflow execution failure",
        false
      );
    }
  }
}

function parseWorkflowDefinition(value: unknown): WorkflowDefinition {
  const result = workflowDefinitionSchema.safeParse(value);

  if (!result.success) {
    throw new WorkflowExecutionWorkerError(
      "workflow_definition_invalid",
      "Workflow definition is invalid for execution",
      false,
      { cause: result.error }
    );
  }

  return result.data;
}

function orderWorkflowNodes(definition: WorkflowDefinition): WorkflowNode[] {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, string[]>();
  const incomingCounts = new Map<string, number>();

  for (const node of definition.nodes) {
    incomingCounts.set(node.id, 0);
  }

  for (const edge of definition.edges) {
    outgoingEdges.set(edge.sourceNodeId, [
      ...(outgoingEdges.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId
    ]);
    incomingCounts.set(edge.targetNodeId, (incomingCounts.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue = definition.nodes
    .filter((node) => node.type === WORKFLOW_NODE_TYPES.manualTrigger)
    .map((node) => node.id);
  const orderedNodes: WorkflowNode[] = [];
  const visitedNodeIds = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId || visitedNodeIds.has(nodeId)) {
      continue;
    }

    const node = nodesById.get(nodeId);

    if (!node) {
      continue;
    }

    visitedNodeIds.add(nodeId);
    orderedNodes.push(node);

    for (const targetNodeId of outgoingEdges.get(nodeId) ?? []) {
      const nextIncomingCount = (incomingCounts.get(targetNodeId) ?? 1) - 1;
      incomingCounts.set(targetNodeId, nextIncomingCount);

      if (nextIncomingCount === 0) {
        queue.push(targetNodeId);
      }
    }
  }

  if (orderedNodes.length !== definition.nodes.length) {
    throw new WorkflowExecutionWorkerError(
      "workflow_definition_unordered",
      "Workflow definition could not be ordered for sequential execution",
      false
    );
  }

  return orderedNodes;
}

function getNodeInput(
  node: WorkflowNode,
  definition: WorkflowDefinition,
  nodeOutputs: Map<string, Record<string, unknown>>,
  fallbackInput: Record<string, unknown>
): Record<string, unknown> {
  const incomingEdges = definition.edges.filter((edge) => edge.targetNodeId === node.id);

  if (incomingEdges.length === 0) {
    return fallbackInput;
  }

  if (incomingEdges.length === 1) {
    return nodeOutputs.get(incomingEdges[0]?.sourceNodeId ?? "") ?? fallbackInput;
  }

  return Object.fromEntries(
    incomingEdges.map((edge) => [edge.sourceNodeId, nodeOutputs.get(edge.sourceNodeId) ?? {}])
  );
}

async function executeNode({
  node,
  input,
  message,
  nodeExecutionId,
  aiOrchestratorClient
}: {
  node: WorkflowNode;
  input: Record<string, unknown>;
  message: WorkflowExecutionRequestedMessage;
  nodeExecutionId: string;
  aiOrchestratorClient: AiOrchestratorClient;
}): Promise<Record<string, unknown>> {
  return await executeWorkflowNode(node, {
    aiOrchestratorClient,
    input,
    message,
    nodeExecutionId
  });
}

async function recordAiTraceForSuccessfulNode(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  startedAt: Date,
  completedAt: Date
): Promise<void> {
  if (node.type !== WORKFLOW_NODE_TYPES.aiPromptAction) {
    return;
  }

  const tokenUsage = getAiTokenUsage(output);
  const providerTrace = getAiProviderTrace(output);

  try {
    const data: WorkflowAiTraceCreateData = {
      workspaceId: message.workspaceId,
      workflowId: message.payload.workflowId,
      workflowExecutionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      credentialId: node.config.credentialId ?? null,
      provider: node.config.provider,
      model: node.config.model,
      status: "SUCCEEDED",
      latencyMs: completedAt.getTime() - startedAt.getTime(),
      providerLatencyMs: providerTrace.providerLatencyMs,
      finishReason: providerTrace.finishReason,
      inputTokenCount: tokenUsage.input,
      outputTokenCount: tokenUsage.output,
      totalTokenCount: tokenUsage.input + tokenUsage.output,
      estimatedCostUsd: estimateAiCostUsd(node.config.provider, node.config.model, tokenUsage),
      inputSizeBytes: getJsonSizeBytes(input),
      outputSizeBytes: getJsonSizeBytes(output),
      schemaValid: true
    };
    const aiTracePrisma = prisma as AiTracePrismaWriter;
    const trace = await aiTracePrisma.workflowAiTrace.create({
      data
    });
    await publishAiTraceCreatedEvent(channel, prisma, message, {
      ...data,
      id: trace.id,
      createdAt: trace.createdAt
    });
  } catch (error) {
    logger.warn("AI trace persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      executionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      status: "SUCCEEDED",
      workflowId: message.payload.workflowId,
      workspaceId: message.workspaceId
    });
  }
}

async function recordAiTraceForFailedNode(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  input: Record<string, unknown>,
  failure: WorkerFailure,
  startedAt: Date,
  failedAt: Date
): Promise<void> {
  if (node.type !== WORKFLOW_NODE_TYPES.aiPromptAction) {
    return;
  }

  try {
    const data: WorkflowAiTraceCreateData = {
      workspaceId: message.workspaceId,
      workflowId: message.payload.workflowId,
      workflowExecutionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      credentialId: node.config.credentialId ?? null,
      provider: node.config.provider,
      model: node.config.model,
      status: "FAILED",
      latencyMs: failedAt.getTime() - startedAt.getTime(),
      inputSizeBytes: getJsonSizeBytes(input),
      schemaValid: null,
      errorCode: failure.code,
      errorMessage: failure.message,
      providerStatusCode: getProviderStatusCode(failure),
      retryable: failure.retryable
    };
    const aiTracePrisma = prisma as AiTracePrismaWriter;
    const trace = await aiTracePrisma.workflowAiTrace.create({
      data
    });
    await publishAiTraceCreatedEvent(channel, prisma, message, {
      ...data,
      id: trace.id,
      createdAt: trace.createdAt
    });
  } catch (error) {
    logger.warn("AI trace persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      executionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      status: "FAILED",
      workflowId: message.payload.workflowId,
      workspaceId: message.workspaceId
    });
  }
}

async function publishAiTraceCreatedEvent(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  trace: WorkflowAiTraceEventRecord
): Promise<void> {
  const outboxMessage = await persistOutboxEvent(
    prisma,
    FLOWPILOT_ROUTING_KEYS.aiTraceCreated,
    createAiTraceCreatedMessage(message, trace)
  );
  await dispatchOutboxEvent(channel, prisma, outboxMessage);
}

function createAiTraceCreatedMessage(
  message: WorkflowExecutionRequestedMessage,
  trace: WorkflowAiTraceEventRecord
): AiTraceCreatedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.aiTraceCreated,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: trace.createdAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `ai.trace.created:${trace.id}`,
    payload: {
      traceId: trace.id,
      workflowId: trace.workflowId,
      executionId: trace.workflowExecutionId,
      nodeExecutionId: trace.nodeExecutionId,
      nodeId: trace.nodeId,
      model: trace.model,
      provider: trace.provider,
      latencyMs: trace.latencyMs,
      providerLatencyMs: trace.providerLatencyMs ?? null,
      finishReason: trace.finishReason ?? null,
      tokenUsage: {
        inputTokens: trace.inputTokenCount ?? 0,
        outputTokens: trace.outputTokenCount ?? 0,
        totalTokens: trace.totalTokenCount ?? 0
      },
      estimatedCostUsd: trace.estimatedCostUsd ?? null,
      status: trace.status,
      errorCode: trace.errorCode ?? null,
      providerStatusCode: trace.providerStatusCode ?? null,
      retryable: trace.retryable ?? null
    }
  };
}

function getAiProviderTrace(output: Record<string, unknown>): {
  providerLatencyMs: number | null;
  finishReason: string | null;
} {
  const trace = isRecord(output.trace) ? output.trace : {};
  const providerLatencyMs = trace.providerLatencyMs;
  const finishReason = trace.finishReason;

  return {
    providerLatencyMs: getNonNegativeIntegerOrNull(providerLatencyMs),
    finishReason: typeof finishReason === "string" && finishReason ? finishReason : null
  };
}

function getAiTokenUsage(output: Record<string, unknown>): { input: number; output: number } {
  const tokens = isRecord(output.tokens) ? output.tokens : {};

  return {
    input: getNonNegativeInteger(tokens.input),
    output: getNonNegativeInteger(tokens.output)
  };
}

function estimateAiCostUsd(
  provider: string,
  model: string,
  tokenUsage: { input: number; output: number }
): number | null {
  if (provider === "deterministic" || model.endsWith(":free")) {
    return 0;
  }

  const pricing = getAiModelPricing(provider, model);

  if (!pricing) {
    return null;
  }

  return (
    (tokenUsage.input / 1_000_000) * pricing.inputUsdPerMillionTokens +
    (tokenUsage.output / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}

function getAiModelPricing(
  provider: string,
  model: string
): { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number } | null {
  if (provider === "openrouter" && model === "openai/gpt-4o-mini") {
    return {
      inputUsdPerMillionTokens: 0.15,
      outputUsdPerMillionTokens: 0.6
    };
  }

  return null;
}

function getNonNegativeIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function getProviderStatusCode(failure: WorkerFailure): number | null {
  const cause = failure.cause;

  if (!(cause instanceof AiOrchestratorClientError)) {
    return null;
  }

  const responseBody = isRecord(cause.responseBody) ? cause.responseBody : undefined;
  const detail = isRecord(responseBody?.detail) ? responseBody.detail : undefined;
  const providerStatus = detail?.status;

  return typeof providerStatus === "number" ? providerStatus : null;
}

function getJsonSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function getNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

async function upsertRunningNodeExecution(
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  input: Record<string, unknown>,
  startedAt: Date
) {
  return prisma.workflowNodeExecution.upsert({
    where: {
      executionId_nodeId: {
        executionId: message.payload.executionId,
        nodeId: node.id
      }
    },
    update: {
      status: "RUNNING",
      input: input as Prisma.InputJsonObject,
      output: Prisma.DbNull,
      error: Prisma.DbNull,
      startedAt,
      completedAt: null
    },
    create: {
      workspaceId: message.workspaceId,
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      nodeId: node.id,
      nodeType: node.type,
      status: "RUNNING",
      input: input as Prisma.InputJsonObject,
      startedAt
    }
  });
}

async function completeNodeExecution(
  prisma: PrismaClient,
  nodeExecutionId: string,
  output: Record<string, unknown>,
  completedAt: Date
): Promise<void> {
  await prisma.workflowNodeExecution.update({
    where: {
      id: nodeExecutionId
    },
    data: {
      status: "SUCCEEDED",
      output: output as Prisma.InputJsonObject,
      error: Prisma.DbNull,
      completedAt
    }
  });
}

async function failNodeExecution(
  prisma: PrismaClient,
  nodeExecutionId: string,
  failure: FlowPilotExecutionError,
  completedAt: Date
): Promise<void> {
  await prisma.workflowNodeExecution.update({
    where: {
      id: nodeExecutionId
    },
    data: {
      status: "FAILED",
      error: failure as Prisma.InputJsonObject,
      completedAt
    }
  });
}

async function publishNodeStartedEvent(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  input: Record<string, unknown>,
  startedAt: Date
): Promise<void> {
  const outboxMessage = await persistOutboxEvent(
    prisma,
    FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
    createNodeExecutionStartedMessage(message, node, nodeExecutionId, input, startedAt)
  );
  await dispatchOutboxEvent(channel, prisma, outboxMessage);
}

async function publishNodeCompletedEvent(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  output: Record<string, unknown>,
  startedAt: Date,
  completedAt: Date
): Promise<void> {
  const outboxMessage = await persistOutboxEvent(
    prisma,
    FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
    createNodeExecutionCompletedMessage(
      message,
      node,
      nodeExecutionId,
      output,
      startedAt,
      completedAt
    )
  );
  await dispatchOutboxEvent(channel, prisma, outboxMessage);
}

async function publishNodeFailedEvent(
  channel: Channel,
  prisma: PrismaClient,
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  failure: FlowPilotExecutionError,
  failedAt: Date
): Promise<void> {
  const outboxMessage = await persistOutboxEvent(
    prisma,
    FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed,
    createNodeExecutionFailedMessage(message, node, nodeExecutionId, failure, failedAt)
  );
  await dispatchOutboxEvent(channel, prisma, outboxMessage);
}

function createNodeExecutionStartedMessage(
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  input: Record<string, unknown>,
  startedAt: Date
): NodeExecutionStartedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: startedAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.node.execution.started:${message.payload.executionId}:${node.id}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      nodeType: node.type,
      input
    }
  };
}

function createNodeExecutionCompletedMessage(
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  output: Record<string, unknown>,
  startedAt: Date,
  completedAt: Date
): NodeExecutionCompletedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: completedAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.node.execution.completed:${message.payload.executionId}:${node.id}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      nodeType: node.type,
      output,
      durationMs: completedAt.getTime() - startedAt.getTime()
    }
  };
}

function createNodeExecutionFailedMessage(
  message: WorkflowExecutionRequestedMessage,
  node: WorkflowNode,
  nodeExecutionId: string,
  failure: FlowPilotExecutionError,
  failedAt: Date
): NodeExecutionFailedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: failedAt.toISOString(),
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    actor: {
      type: "system",
      id: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker
    },
    idempotencyKey: `workflow.node.execution.failed:${message.payload.executionId}:${node.id}`,
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      nodeExecutionId,
      nodeId: node.id,
      nodeType: node.type,
      error: failure
    }
  };
}

async function failWorkflowExecution(
  message: WorkflowExecutionRequestedMessage,
  channel: Channel,
  prisma: PrismaClient,
  failure: FlowPilotExecutionError
): Promise<void> {
  const failedAt = new Date();
  const failureRecord = {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable
  };
  const failedMessage = createWorkflowExecutionFailedMessage(message, failureRecord, failedAt);

  const update = await prisma.$transaction(async (tx) => {
    const statusUpdate = await tx.workflowExecution.updateMany({
      where: {
        id: message.payload.executionId,
        status: {
          in: ["PENDING", "RUNNING"]
        }
      },
      data: {
        status: "FAILED",
        error: failureRecord as Prisma.InputJsonObject,
        completedAt: failedAt
      }
    });

    if (statusUpdate.count === 0) {
      return {
        statusUpdate
      };
    }

    const outboxMessage = await persistOutboxEvent(
      tx,
      FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
      failedMessage
    );

    return {
      statusUpdate,
      outboxMessage
    };
  });

  if (update.statusUpdate.count === 0) {
    const execution = await prisma.workflowExecution.findUnique({
      where: {
        id: message.payload.executionId
      }
    });

    if (execution && isTerminalExecutionStatus(execution.status)) {
      logger.info("Skipping failed event because workflow execution is already terminal", {
        executionId: execution.id,
        status: execution.status
      });
      await dispatchPendingWorkflowExecutionOutboxMessages(channel, prisma, execution.id);
      return;
    }

    throw new WorkflowExecutionWorkerError(
      "workflow_execution_failure_conflict",
      "Workflow execution could not be failed from PENDING or RUNNING state",
      true
    );
  }

  if (!update.outboxMessage) {
    throw new WorkflowExecutionWorkerError(
      "workflow_execution_failed_outbox_missing",
      "Workflow execution failed outbox message was not created",
      true
    );
  }

  await dispatchOutboxEvent(channel, prisma, update.outboxMessage);
}

async function persistOutboxEvent(
  prisma: PrismaWriter,
  routingKey: WorkflowLifecycleRoutingKey,
  message: WorkflowLifecycleMessage
) {
  const idempotencyKey = message.idempotencyKey ?? message.eventId;
  const headers = createOutboxHeaders(message);

  return prisma.outboxMessage.upsert({
    where: {
      idempotencyKey
    },
    update: {},
    create: {
      exchange: FLOWPILOT_EXCHANGES.events,
      routingKey,
      eventName: message.eventName,
      messageId: message.eventId,
      idempotencyKey,
      payload: message as unknown as Prisma.InputJsonObject,
      headers: headers as Prisma.InputJsonObject
    }
  });
}

async function dispatchOutboxEvent(
  channel: Channel,
  prisma: PrismaClient,
  outboxMessage: Awaited<ReturnType<typeof persistOutboxEvent>>
): Promise<void> {
  if (outboxMessage.status === "PUBLISHED") {
    return;
  }

  const headers = isRecord(outboxMessage.headers) ? outboxMessage.headers : {};
  let published: boolean;

  try {
    published = channel.publish(
      outboxMessage.exchange,
      outboxMessage.routingKey,
      Buffer.from(JSON.stringify(outboxMessage.payload)),
      {
        contentType: "application/json",
        deliveryMode: 2,
        messageId: outboxMessage.messageId,
        timestamp: Math.floor(Date.now() / 1000),
        type: outboxMessage.eventName,
        headers
      }
    );
  } catch (error) {
    const publishError = error instanceof Error ? error : new Error(String(error));
    await markOutboxPublishFailure(prisma, outboxMessage, publishError);
    throw publishError;
  }

  if (!published) {
    const error = new Error("RabbitMQ channel backpressure while publishing outbox message");
    await markOutboxPublishFailure(prisma, outboxMessage, error);
    throw error;
  }

  await prisma.outboxMessage.update({
    where: {
      id: outboxMessage.id
    },
    data: {
      status: "PUBLISHED",
      attempts: {
        increment: 1
      },
      lastError: null,
      publishedAt: new Date()
    }
  });
  logger.info("Outbox message published", {
    eventName: outboxMessage.eventName,
    id: outboxMessage.id,
    routingKey: outboxMessage.routingKey
  });
}

export async function dispatchPendingOutboxMessages(
  channel: Channel,
  prisma: PrismaClient,
  batchSize = outboxDispatcherBatchSize
): Promise<{ fetched: number; failed: number; published: number }> {
  const pendingMessages = await prisma.outboxMessage.findMany({
    where: {
      status: "PENDING",
      attempts: {
        lt: outboxMaxPublishAttempts
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: batchSize
  });

  let failed = 0;
  let published = 0;

  for (const pendingMessage of pendingMessages) {
    try {
      await dispatchOutboxEvent(channel, prisma, pendingMessage);
      published += 1;
    } catch (error) {
      failed += 1;
      logger.error("Outbox message publish failed", {
        error: error instanceof Error ? error.message : String(error),
        eventName: pendingMessage.eventName,
        id: pendingMessage.id,
        routingKey: pendingMessage.routingKey
      });
    }
  }

  return {
    fetched: pendingMessages.length,
    failed,
    published
  };
}

async function dispatchPendingWorkflowExecutionOutboxMessages(
  channel: Channel,
  prisma: PrismaClient,
  executionId: string
): Promise<void> {
  const pendingMessages = await prisma.outboxMessage.findMany({
    where: {
      status: "PENDING",
      idempotencyKey: {
        in: [
          `workflow.execution.started:${executionId}`,
          `workflow.execution.completed:${executionId}`,
          `workflow.execution.failed:${executionId}`
        ]
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  for (const pendingMessage of pendingMessages) {
    await dispatchOutboxEvent(channel, prisma, pendingMessage);
  }
}

async function markOutboxPublishFailure(
  prisma: PrismaClient,
  outboxMessage: Awaited<ReturnType<typeof persistOutboxEvent>>,
  error: Error
): Promise<void> {
  const attempts = outboxMessage.attempts + 1;
  await prisma.outboxMessage.update({
    where: {
      id: outboxMessage.id
    },
    data: {
      attempts,
      lastError: error.message,
      status: attempts >= outboxMaxPublishAttempts ? "FAILED" : outboxMessage.status
    }
  });
  logger.error("Outbox message publish attempt failed", {
    attempts,
    eventName: outboxMessage.eventName,
    id: outboxMessage.id,
    lastError: error.message,
    status: attempts >= outboxMaxPublishAttempts ? "FAILED" : outboxMessage.status
  });
}

function createOutboxHeaders(message: WorkflowLifecycleMessage): Record<string, unknown> {
  return {
    correlationId: message.correlationId,
    producer: message.producer,
    schemaVersion: message.schemaVersion,
    workspaceId: message.workspaceId
  };
}

async function publishRetryCommand(
  channel: Channel,
  message: WorkflowExecutionRequestedMessage,
  retryAttempt: number
): Promise<void> {
  const retryConfig = retryQueueConfig[retryAttempt - 1];

  if (!retryConfig) {
    throw new WorkflowExecutionWorkerError(
      "workflow_execution_retry_policy_missing",
      `No retry queue configured for attempt ${retryAttempt}`,
      false
    );
  }

  channel.publish(
    FLOWPILOT_EXCHANGES.retry,
    retryConfig.routingKey,
    Buffer.from(JSON.stringify(message)),
    {
      contentType: "application/json",
      deliveryMode: 2,
      messageId: message.eventId,
      timestamp: Math.floor(Date.parse(message.occurredAt) / 1000),
      type: message.eventName,
      headers: {
        correlationId: message.correlationId,
        producer: message.producer,
        schemaVersion: message.schemaVersion,
        workspaceId: message.workspaceId,
        [retryAttemptHeader]: retryAttempt
      }
    }
  );

  logger.info("Workflow execution retry scheduled", {
    retryDelayMs: retryConfig.ttlMs,
    executionId: message.payload.executionId,
    retryAttempt,
    retryQueue: retryConfig.queue
  });
}

async function publishCommandDeadLetter(
  channel: Channel,
  message: WorkflowExecutionRequestedMessage,
  failure: FlowPilotExecutionError,
  retryAttempt: number
): Promise<void> {
  channel.publish(
    FLOWPILOT_EXCHANGES.dlx,
    FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
    Buffer.from(JSON.stringify(message)),
    {
      contentType: "application/json",
      deliveryMode: 2,
      messageId: message.eventId,
      timestamp: Math.floor(Date.parse(message.occurredAt) / 1000),
      type: message.eventName,
      headers: {
        correlationId: message.correlationId,
        producer: message.producer,
        schemaVersion: message.schemaVersion,
        workspaceId: message.workspaceId,
        [retryAttemptHeader]: retryAttempt,
        "x-flowpilot-dead-letter-code": failure.code,
        "x-flowpilot-dead-letter-reason": failure.message
      }
    }
  );
  logger.error("Workflow execution command dead-lettered", {
    code: failure.code,
    executionId: message.payload.executionId,
    reason: failure.message,
    retryAttempt,
    retryable: failure.retryable
  });
}

async function publishRawDeadLetter(
  channel: Channel,
  message: ConsumeMessage,
  reason: string
): Promise<void> {
  channel.publish(FLOWPILOT_EXCHANGES.dlx, message.fields.routingKey, message.content, {
    contentType: message.properties.contentType,
    deliveryMode: 2,
    messageId: message.properties.messageId,
    timestamp: Math.floor(Date.now() / 1000),
    type: message.properties.type,
    headers: {
      ...message.properties.headers,
      "x-flowpilot-dead-letter-reason": reason
    }
  });
}

async function declareTopology(channel: Channel): Promise<void> {
  await Promise.all([
    channel.assertExchange(FLOWPILOT_EXCHANGES.commands, "topic", { durable: true }),
    channel.assertExchange(FLOWPILOT_EXCHANGES.events, "topic", { durable: true }),
    channel.assertExchange(FLOWPILOT_EXCHANGES.retry, "topic", { durable: true }),
    channel.assertExchange(FLOWPILOT_EXCHANGES.dlx, "topic", { durable: true })
  ]);

  await declareLeadEnrichmentTopology(channel);

  await channel.assertQueue(FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions, {
    durable: true
  });

  await channel.assertQueue(FLOWPILOT_DEAD_LETTER_QUEUES.executionWorkerWorkflowExecutions, {
    durable: true
  });

  await channel.bindQueue(
    FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions,
    FLOWPILOT_EXCHANGES.commands,
    FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
  );

  await channel.bindQueue(
    FLOWPILOT_DEAD_LETTER_QUEUES.executionWorkerWorkflowExecutions,
    FLOWPILOT_EXCHANGES.dlx,
    FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
  );

  for (const retryConfig of retryQueueConfig) {
    await channel.assertQueue(retryConfig.queue, {
      durable: true,
      arguments: {
        "x-message-ttl": retryConfig.ttlMs,
        "x-dead-letter-exchange": FLOWPILOT_EXCHANGES.commands,
        "x-dead-letter-routing-key": FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
      }
    });
    await channel.bindQueue(retryConfig.queue, FLOWPILOT_EXCHANGES.retry, retryConfig.routingKey);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getWorkflowExecutionRetryAttempt(message: ConsumeMessage): number {
  const retryAttempt = message.properties.headers?.[retryAttemptHeader];

  if (typeof retryAttempt === "number" && Number.isInteger(retryAttempt) && retryAttempt >= 0) {
    return retryAttempt;
  }

  if (typeof retryAttempt === "string") {
    const parsedRetryAttempt = Number.parseInt(retryAttempt, 10);

    if (Number.isInteger(parsedRetryAttempt) && parsedRetryAttempt >= 0) {
      return parsedRetryAttempt;
    }
  }

  return 0;
}

function isTerminalExecutionStatus(status: string): status is Extract<
  ExecutionStatus,
  "SUCCEEDED" | "FAILED" | "CANCELLED"
> {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}

function normalizeWorkerFailure(error: unknown): WorkerFailure {
  if (error instanceof WorkflowExecutionWorkerError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      cause: error.cause
    };
  }

  if (error instanceof AiOrchestratorClientError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      cause: error
    };
  }

  return {
    code: "workflow_execution_worker_error",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
    cause: error
  };
}

async function shutdown(resources: WorkerResources): Promise<void> {
  logger.info("Stopping execution worker");
  clearInterval(resources.outboxDispatcher);
  clearInterval(resources.scheduledActionDispatcher);
  await resources.channel.close();
  await resources.connection.close();
  await resources.prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resources = await startWorker();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(resources).finally(() => {
        process.exit(0);
      });
    });
  }
}
