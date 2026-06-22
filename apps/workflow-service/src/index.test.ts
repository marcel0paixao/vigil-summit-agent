import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type NodeExecutionCompletedMessage,
  type NodeExecutionStartedMessage,
  type WorkflowExecutionCompletedMessage,
  type WorkflowExecutionFailedMessage,
  type WorkflowExecutionStartedMessage
} from "@flowpilot/contracts";
import type { PrismaClient } from "@prisma/client/index";
import type { ConsumeMessage } from "amqplib";

import {
  parseWorkflowExecutionLifecycleMessage,
  persistWorkflowExecutionEvent
} from "./index.js";

test("parses workflow execution started events", () => {
  const parsed = parseWorkflowExecutionLifecycleMessage(
    createConsumeMessage(workflowExecutionStartedMessage())
  );

  assert.equal(parsed?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted);
  assert.equal(parsed?.payload.executionId, "execution-1");
});

test("parses workflow execution completed events", () => {
  const parsed = parseWorkflowExecutionLifecycleMessage(
    createConsumeMessage(workflowExecutionCompletedMessage())
  );

  assert.equal(parsed?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted);
  assert.deepEqual("output" in (parsed?.payload ?? {}), true);
});

test("parses workflow execution failed events", () => {
  const parsed = parseWorkflowExecutionLifecycleMessage(
    createConsumeMessage(workflowExecutionFailedMessage())
  );

  assert.equal(parsed?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed);
  assert.deepEqual("error" in (parsed?.payload ?? {}), true);
});

test("parses workflow node execution lifecycle events", () => {
  const started = parseWorkflowExecutionLifecycleMessage(
    createConsumeMessage(nodeExecutionStartedMessage())
  );
  const completed = parseWorkflowExecutionLifecycleMessage(
    createConsumeMessage(nodeExecutionCompletedMessage())
  );

  assert.equal(started?.eventName, FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted);
  assert.equal(started?.payload.executionId, "execution-1");
  assert.equal(completed?.eventName, FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted);
  assert.deepEqual("output" in (completed?.payload ?? {}), true);
});

test("rejects malformed workflow execution lifecycle events", () => {
  assert.equal(parseWorkflowExecutionLifecycleMessage(createConsumeMessage("{not-json")), null);
  assert.equal(
    parseWorkflowExecutionLifecycleMessage(
      createConsumeMessage({
        ...workflowExecutionStartedMessage(),
        eventName: FLOWPILOT_ROUTING_KEYS.workflowCreated
      })
    ),
    null
  );
});

test("persists workflow execution timeline events idempotently", async () => {
  const calls: unknown[] = [];
  const prisma = {
    workflowExecutionEvent: {
      upsert: async (args: unknown) => {
        calls.push(args);
      }
    }
  } as unknown as PrismaClient;

  await persistWorkflowExecutionEvent(workflowExecutionCompletedMessage(), prisma);

  assert.deepEqual(calls, [
    {
      create: {
        eventId: "completed-event-1",
        eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
        executionId: "execution-1",
        occurredAt: new Date("2026-05-04T12:01:00.000Z"),
        payload: {
          durationMs: 1000,
          executionId: "execution-1",
          output: {
            ok: true
          },
          workflowId: "workflow-1"
        },
        producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
        workflowId: "workflow-1",
        workspaceId: "workspace-1"
      },
      update: {},
      where: {
        eventId: "completed-event-1"
      }
    }
  ]);
});

function workflowExecutionStartedMessage(): WorkflowExecutionStartedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
    eventId: "started-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1"
    }
  };
}

function workflowExecutionCompletedMessage(): WorkflowExecutionCompletedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
    eventId: "completed-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:01:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1",
      output: {
        ok: true
      },
      durationMs: 1000
    }
  };
}

function workflowExecutionFailedMessage(): WorkflowExecutionFailedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
    eventId: "failed-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:01:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1",
      error: {
        code: "workflow_execution_failed",
        message: "Workflow execution failed",
        retryable: false
      }
    }
  };
}

function nodeExecutionStartedMessage(): NodeExecutionStartedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
    eventId: "node-started-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:00:10.000Z",
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
  };
}

function nodeExecutionCompletedMessage(): NodeExecutionCompletedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
    eventId: "node-completed-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-04T12:00:11.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1",
      nodeExecutionId: "node-execution-1",
      nodeId: "normalize-lead",
      nodeType: "action.transform",
      output: {
        leadId: "lead-1"
      },
      durationMs: 1000
    }
  };
}

function createConsumeMessage(payload: unknown): ConsumeMessage {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);

  return {
    content: Buffer.from(body),
    fields: {
      consumerTag: "test",
      deliveryTag: 1,
      redelivered: false,
      exchange: "flowpilot.events",
      routingKey: FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted
    },
    properties: {
      contentType: "application/json",
      contentEncoding: undefined,
      headers: {},
      deliveryMode: 2,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined
    }
  };
}
