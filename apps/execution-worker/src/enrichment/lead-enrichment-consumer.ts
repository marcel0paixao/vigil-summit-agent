import {
  FLOWPILOT_DEAD_LETTER_QUEUES,
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MAX_RETRY_ATTEMPTS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_QUEUES,
  FLOWPILOT_RETRY_QUEUES,
  FLOWPILOT_RETRY_ROUTING_KEYS,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import { createLogger } from "@flowpilot/logger";
import { type PrismaClient } from "@prisma/client/index";
import { type Channel, type ConsumeMessage } from "amqplib";

import { type EnrichmentProvider } from "./enrichment-provider.js";
import { LeadEnrichmentError, processLeadEnrichment } from "./process-lead-enrichment.js";

const logger = createLogger("engagement-worker", "debug");
const retryAttemptHeader = "x-flowpilot-retry-attempt";

const retryQueueConfig = [
  {
    queue: FLOWPILOT_RETRY_QUEUES.engagementWorkerLeadEnrichment10s,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.leadEnrichmentRequested10s,
    ttlMs: 10_000
  },
  {
    queue: FLOWPILOT_RETRY_QUEUES.engagementWorkerLeadEnrichment1m,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.leadEnrichmentRequested1m,
    ttlMs: 60_000
  },
  {
    queue: FLOWPILOT_RETRY_QUEUES.engagementWorkerLeadEnrichment5m,
    routingKey: FLOWPILOT_RETRY_ROUTING_KEYS.leadEnrichmentRequested5m,
    ttlMs: 300_000
  }
] as const;

export async function declareLeadEnrichmentTopology(channel: Channel): Promise<void> {
  await channel.assertQueue(FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment, {
    durable: true
  });
  await channel.assertQueue(FLOWPILOT_DEAD_LETTER_QUEUES.engagementWorkerLeadEnrichment, {
    durable: true
  });
  await channel.bindQueue(
    FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment,
    FLOWPILOT_EXCHANGES.commands,
    FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested
  );
  await channel.bindQueue(
    FLOWPILOT_DEAD_LETTER_QUEUES.engagementWorkerLeadEnrichment,
    FLOWPILOT_EXCHANGES.dlx,
    FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested
  );

  for (const retryConfig of retryQueueConfig) {
    await channel.assertQueue(retryConfig.queue, {
      durable: true,
      arguments: {
        "x-message-ttl": retryConfig.ttlMs,
        "x-dead-letter-exchange": FLOWPILOT_EXCHANGES.commands,
        "x-dead-letter-routing-key": FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested
      }
    });
    await channel.bindQueue(
      retryConfig.queue,
      FLOWPILOT_EXCHANGES.retry,
      retryConfig.routingKey
    );
  }
}

export async function handleLeadEnrichmentDelivery(
  delivery: ConsumeMessage,
  channel: Channel,
  prisma: PrismaClient,
  provider: EnrichmentProvider
): Promise<void> {
  const message = parseLeadEnrichmentRequestedMessage(delivery.content);

  if (!message) {
    publishDeadLetter(channel, delivery, "invalid_payload");
    channel.ack(delivery);
    return;
  }

  try {
    const snapshot = await processLeadEnrichment(message, prisma, provider);
    channel.ack(delivery);
    logger.info("Lead enrichment completed", {
      leadId: message.payload.leadId,
      registrationId: message.payload.registrationId,
      snapshotId: snapshot.id
    });
  } catch (error) {
    const failure = normalizeFailure(error);
    const currentAttempt = getRetryAttempt(delivery);

    try {
      if (failure.retryable && currentAttempt < FLOWPILOT_MAX_RETRY_ATTEMPTS) {
        publishRetry(channel, message, currentAttempt + 1);
        channel.ack(delivery);
        return;
      }

      publishDeadLetter(channel, delivery, failure.code, failure.message, currentAttempt);
      channel.ack(delivery);
    } catch (publishError) {
      logger.error("Failed to route lead enrichment failure", {
        error: publishError instanceof Error ? publishError.message : String(publishError),
        registrationId: message.payload.registrationId
      });
      channel.nack(delivery, false, true);
    }
  }
}

export function parseLeadEnrichmentRequestedMessage(
  content: Buffer
): LeadEnrichmentRequestedMessage | null {
  try {
    const value: unknown = JSON.parse(content.toString("utf8"));

    if (
      !isRecord(value) ||
      value.eventName !== FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested ||
      typeof value.eventId !== "string" ||
      value.schemaVersion !== FLOWPILOT_MESSAGE_SCHEMA_VERSION ||
      typeof value.occurredAt !== "string" ||
      typeof value.workspaceId !== "string" ||
      typeof value.correlationId !== "string" ||
      typeof value.producer !== "string" ||
      !isRecord(value.payload) ||
      typeof value.payload.eventId !== "string" ||
      typeof value.payload.leadId !== "string" ||
      typeof value.payload.registrationId !== "string"
    ) {
      return null;
    }

    return value as LeadEnrichmentRequestedMessage;
  } catch {
    return null;
  }
}

function publishRetry(
  channel: Channel,
  message: LeadEnrichmentRequestedMessage,
  retryAttempt: number
): void {
  const retryConfig = retryQueueConfig[retryAttempt - 1];

  if (!retryConfig) {
    throw new Error(`No lead enrichment retry queue for attempt ${retryAttempt}`);
  }

  channel.publish(
    FLOWPILOT_EXCHANGES.retry,
    retryConfig.routingKey,
    Buffer.from(JSON.stringify(message)),
    {
      contentType: "application/json",
      deliveryMode: 2,
      messageId: message.eventId,
      timestamp: Math.floor(Date.now() / 1000),
      type: message.eventName,
      headers: {
        correlationId: message.correlationId,
        schemaVersion: message.schemaVersion,
        workspaceId: message.workspaceId,
        [retryAttemptHeader]: retryAttempt
      }
    }
  );
}

function publishDeadLetter(
  channel: Channel,
  delivery: ConsumeMessage,
  code: string,
  reason = code,
  retryAttempt = getRetryAttempt(delivery)
): void {
  channel.publish(FLOWPILOT_EXCHANGES.dlx, FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested, delivery.content, {
    contentType: delivery.properties.contentType ?? "application/json",
    deliveryMode: 2,
    messageId: delivery.properties.messageId,
    timestamp: Math.floor(Date.now() / 1000),
    type: delivery.properties.type,
    headers: {
      ...delivery.properties.headers,
      [retryAttemptHeader]: retryAttempt,
      "x-flowpilot-dead-letter-code": code,
      "x-flowpilot-dead-letter-reason": reason
    }
  });
}

function getRetryAttempt(message: ConsumeMessage): number {
  const value = message.properties.headers?.[retryAttemptHeader];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeFailure(error: unknown): LeadEnrichmentError {
  if (error instanceof LeadEnrichmentError) {
    return error;
  }

  return new LeadEnrichmentError(
    "lead_enrichment_worker_failed",
    error instanceof Error ? error.message : String(error),
    true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
