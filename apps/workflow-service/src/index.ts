import { readConfig } from "@flowpilot/config";
import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_QUEUES,
  FLOWPILOT_ROUTING_KEYS,
  type FlowPilotMessageProducer,
  type NodeExecutionCompletedMessage,
  type NodeExecutionFailedMessage,
  type NodeExecutionStartedMessage,
  type WorkflowExecutionCompletedMessage,
  type WorkflowExecutionFailedMessage,
  type WorkflowExecutionStartedMessage
} from "@flowpilot/contracts";
import { createLogger } from "@flowpilot/logger";
import { Prisma, PrismaClient } from "@prisma/client/index";
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";
import { pathToFileURL } from "node:url";

const logger = createLogger("workflow-service", "debug");

type WorkflowServiceResources = {
  channel: Channel;
  connection: ChannelModel;
  prisma: PrismaClient;
};

type WorkflowExecutionLifecycleMessage =
  | WorkflowExecutionStartedMessage
  | WorkflowExecutionCompletedMessage
  | WorkflowExecutionFailedMessage
  | NodeExecutionStartedMessage
  | NodeExecutionCompletedMessage
  | NodeExecutionFailedMessage;

const workflowExecutionLifecycleEvents = new Set<string>([
  FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
  FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed
]);

export async function startWorkflowService(): Promise<WorkflowServiceResources> {
  const config = readConfig();
  const prisma = new PrismaClient();
  const connection = await connect(config.rabbitmqUrl);
  const channel = await connection.createChannel();

  await declareTopology(channel);
  await channel.prefetch(10);

  await channel.consume(FLOWPILOT_QUEUES.workflowServiceExecutionEvents, async (message) => {
    if (!message) {
      return;
    }

    await handleDelivery(message, channel, prisma);
  });

  logger.info("Workflow service started", {
    queue: FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    routingKey: "workflow.execution.*"
  });

  return {
    channel,
    connection,
    prisma
  };
}

export async function handleDelivery(
  message: ConsumeMessage,
  channel: Channel,
  prisma: PrismaClient
): Promise<void> {
  const parsedMessage = parseWorkflowExecutionLifecycleMessage(message);

  if (!parsedMessage) {
    logger.warn("Rejecting invalid workflow execution lifecycle event", {
      routingKey: message.fields.routingKey
    });
    channel.nack(message, false, false);
    return;
  }

  try {
    await persistWorkflowExecutionEvent(parsedMessage, prisma);
    channel.ack(message);
  } catch (error) {
    logger.error("Workflow execution lifecycle event persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      eventId: parsedMessage.eventId,
      eventName: parsedMessage.eventName,
      executionId: parsedMessage.payload.executionId
    });
    channel.nack(message, false, !isNonRetryablePersistenceError(error));
  }
}

export async function persistWorkflowExecutionEvent(
  message: WorkflowExecutionLifecycleMessage,
  prisma: PrismaClient
): Promise<void> {
  await prisma.workflowExecutionEvent.upsert({
    where: {
      eventId: message.eventId
    },
    update: {},
    create: {
      workspaceId: message.workspaceId,
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      eventName: message.eventName,
      eventId: message.eventId,
      occurredAt: new Date(message.occurredAt),
      producer: message.producer,
      payload: message.payload as Prisma.InputJsonObject
    }
  });
}

export function parseWorkflowExecutionLifecycleMessage(
  message: ConsumeMessage
): WorkflowExecutionLifecycleMessage | null {
  let payload: unknown;

  try {
    payload = JSON.parse(message.content.toString("utf8"));
  } catch {
    return null;
  }

  if (!isWorkflowExecutionLifecycleMessage(payload)) {
    return null;
  }

  return payload;
}

function isWorkflowExecutionLifecycleMessage(
  value: unknown
): value is WorkflowExecutionLifecycleMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.eventName !== "string" ||
    !workflowExecutionLifecycleEvents.has(value.eventName) ||
    typeof value.eventId !== "string" ||
    value.schemaVersion !== FLOWPILOT_MESSAGE_SCHEMA_VERSION ||
    typeof value.occurredAt !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.correlationId !== "string" ||
    !isFlowPilotMessageProducer(value.producer) ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  const payload = value.payload;

  if (typeof payload.workflowId !== "string" || typeof payload.executionId !== "string") {
    return false;
  }

  if (value.eventName === FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted) {
    return isRecord(payload.output) && typeof payload.durationMs === "number";
  }

  if (value.eventName === FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed) {
    return isRecord(payload.error) && typeof payload.error.message === "string";
  }

  if (value.eventName === FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted) {
    return true;
  }

  if (value.eventName === FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted) {
    return (
      typeof payload.nodeExecutionId === "string" &&
      typeof payload.nodeId === "string" &&
      typeof payload.nodeType === "string" &&
      isRecord(payload.input)
    );
  }

  if (value.eventName === FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted) {
    return (
      typeof payload.nodeExecutionId === "string" &&
      typeof payload.nodeId === "string" &&
      typeof payload.nodeType === "string" &&
      isRecord(payload.output) &&
      typeof payload.durationMs === "number"
    );
  }

  return (
    value.eventName === FLOWPILOT_ROUTING_KEYS.nodeExecutionFailed &&
    typeof payload.nodeExecutionId === "string" &&
    typeof payload.nodeId === "string" &&
    typeof payload.nodeType === "string" &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  );
}

function isFlowPilotMessageProducer(value: unknown): value is FlowPilotMessageProducer {
  return (
    value === FLOWPILOT_MESSAGE_PRODUCERS.api ||
    value === FLOWPILOT_MESSAGE_PRODUCERS.workflowService ||
    value === FLOWPILOT_MESSAGE_PRODUCERS.executionWorker ||
    value === FLOWPILOT_MESSAGE_PRODUCERS.aiOrchestrator ||
    value === FLOWPILOT_MESSAGE_PRODUCERS.observabilityService
  );
}

async function declareTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(FLOWPILOT_EXCHANGES.events, "topic", { durable: true });
  await channel.assertQueue(FLOWPILOT_QUEUES.workflowServiceExecutionEvents, {
    durable: true
  });
  await channel.bindQueue(
    FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    FLOWPILOT_EXCHANGES.events,
    "workflow.execution.*"
  );
  await channel.bindQueue(
    FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    FLOWPILOT_EXCHANGES.events,
    "workflow.node.execution.*"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonRetryablePersistenceError(error: unknown): boolean {
  return isRecord(error) && error.code === "P2003";
}

async function shutdown(resources: WorkflowServiceResources): Promise<void> {
  logger.info("Stopping workflow service");
  await resources.channel.close();
  await resources.connection.close();
  await resources.prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resources = await startWorkflowService();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(resources).finally(() => {
        process.exit(0);
      });
    });
  }
}
