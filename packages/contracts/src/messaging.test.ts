import assert from "node:assert/strict";
import { test } from "node:test";

import {
  eventNames,
  FLOWPILOT_DEAD_LETTER_QUEUES,
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MAX_RETRY_ATTEMPTS,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_QUEUES,
  FLOWPILOT_RETRY_DELAYS,
  FLOWPILOT_RETRY_QUEUES,
  FLOWPILOT_RETRY_ROUTING_KEYS,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentCompletedMessage,
  type LeadEnrichmentRequestedMessage,
  type WorkflowExecutionRequestedMessage
} from "./index.js";

test("routing keys stay aligned with exported event names", () => {
  assert.deepEqual(
    [...Object.values(FLOWPILOT_ROUTING_KEYS)].sort(),
    [...eventNames].sort()
  );
});

test("messaging resources follow FlowPilot naming conventions", () => {
  for (const exchange of Object.values(FLOWPILOT_EXCHANGES)) {
    assert.match(exchange, /^flowpilot\./);
  }

  for (const queue of Object.values(FLOWPILOT_QUEUES)) {
    assert.match(queue, /^flowpilot\./);
  }

  for (const retryQueue of Object.values(FLOWPILOT_RETRY_QUEUES)) {
    assert.match(retryQueue, /^flowpilot\.retry\./);
  }

  for (const retryRoutingKey of Object.values(FLOWPILOT_RETRY_ROUTING_KEYS)) {
    assert.match(retryRoutingKey, /^(workflow\.execution|lead\.enrichment)\.requested\.retry\./);
  }

  for (const deadLetterQueue of Object.values(FLOWPILOT_DEAD_LETTER_QUEUES)) {
    assert.match(deadLetterQueue, /^flowpilot\.dlq\./);
  }
});

test("retry policy exposes one delay per attempt", () => {
  assert.equal(Object.values(FLOWPILOT_RETRY_DELAYS).length, FLOWPILOT_MAX_RETRY_ATTEMPTS);
});

test("message producers match service names", () => {
  assert.deepEqual([...Object.values(FLOWPILOT_MESSAGE_PRODUCERS)].sort(), [
    "ai-orchestrator",
    "api",
    "engagement-worker",
    "execution-worker",
    "observability-service",
    "workflow-service"
  ]);
});

test("message envelope supports typed event payloads", () => {
  const message = {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
    eventId: "event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-01T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "correlation-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    payload: {
      workflowId: "workflow-1",
      workflowVersion: 1,
      executionId: "execution-1",
      requestedBy: {
        type: "user",
        id: "user-1"
      },
      input: {
        hello: "world"
      }
    }
  } satisfies WorkflowExecutionRequestedMessage;

  assert.equal(message.payload.workflowVersion, 1);
});

test("lead enrichment requests carry event and registration context", () => {
  const message = {
    eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
    eventId: "message-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-06-20T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "registration:registration-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    payload: {
      eventId: "event-1",
      leadId: "lead-1",
      registrationId: "registration-1"
    }
  } satisfies LeadEnrichmentRequestedMessage;

  assert.equal(message.payload.registrationId, "registration-1");
});

test("lead enrichment completion carries snapshot provenance", () => {
  const message = {
    eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted,
    eventId: "message-2",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-06-20T12:00:01.000Z",
    workspaceId: "workspace-1",
    correlationId: "registration:registration-1",
    causationId: "message-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.engagementWorker,
    payload: {
      eventId: "event-1",
      leadId: "lead-1",
      registrationId: "registration-1",
      snapshotId: "snapshot-1",
      provider: "synthetic",
      confidence: 0.96
    }
  } satisfies LeadEnrichmentCompletedMessage;

  assert.equal(message.payload.provider, "synthetic");
});

test("node execution events include persisted node execution identity", () => {
  const message = {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
    eventId: "event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1",
      nodeExecutionId: "node-execution-1",
      nodeId: "normalize-lead",
      nodeType: "action.transform",
      input: {
        leadId: "lead-1"
      }
    }
  } satisfies import("./index.js").NodeExecutionStartedMessage;

  assert.equal(message.payload.nodeExecutionId, "node-execution-1");
});
