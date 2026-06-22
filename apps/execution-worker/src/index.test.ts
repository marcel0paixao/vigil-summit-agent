import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_RETRY_ROUTING_KEYS,
  FLOWPILOT_ROUTING_KEYS,
  WORKFLOW_NODE_TYPES,
  type WorkflowDefinition,
  type WorkflowExecutionRequestedMessage
} from "@flowpilot/contracts";
import type { Channel, ConsumeMessage } from "amqplib";
import type { PrismaClient } from "@prisma/client/index";

import {
  AiOrchestratorClient,
  AiOrchestratorClientError,
  type AiPromptRunInput
} from "./ai-orchestrator-client.js";
import {
  dispatchPendingOutboxMessages,
  getWorkflowExecutionRetryAttempt,
  handleDelivery,
  parseWorkflowExecutionRequestedMessage,
  processWorkflowExecution
} from "./index.js";

const testAiOrchestratorClient = createFakeAiOrchestratorClient();

test("parses valid workflow execution request messages", () => {
  const parsed = parseWorkflowExecutionRequestedMessage(createConsumeMessage(validMessage()));

  assert.equal(parsed?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested);
  assert.equal(parsed?.payload.executionId, "execution-1");
  assert.equal(parsed?.payload.input.leadId, "lead-1");
});

test("rejects invalid workflow execution request messages", () => {
  const invalidMessage = {
    ...validMessage(),
    eventName: FLOWPILOT_ROUTING_KEYS.workflowCreated
  };

  assert.equal(parseWorkflowExecutionRequestedMessage(createConsumeMessage(invalidMessage)), null);
});

test("rejects malformed json messages", () => {
  assert.equal(parseWorkflowExecutionRequestedMessage(createConsumeMessage("{not-json")), null);
});

test("reads retry attempts from AMQP headers", () => {
  assert.equal(
    getWorkflowExecutionRetryAttempt(
      createConsumeMessage(validMessage(), {
        headers: {
          "x-flowpilot-retry-attempt": 2
        }
      })
    ),
    2
  );

  assert.equal(
    getWorkflowExecutionRetryAttempt(
      createConsumeMessage(validMessage(), {
        headers: {
          "x-flowpilot-retry-attempt": "3"
        }
      })
    ),
    3
  );

  assert.equal(getWorkflowExecutionRetryAttempt(createConsumeMessage(validMessage())), 0);
});

test("skips processing when workflow execution is already terminal", async () => {
  const channel = createFakeChannel();
  const prisma = {
    workflowExecution: {
      findUnique: async () => ({
        id: "execution-1",
        workflowId: "workflow-1",
        workspaceId: "workspace-1",
        status: "SUCCEEDED",
        startedAt: new Date("2026-05-02T12:00:00.000Z")
      }),
      updateMany: async () => {
        throw new Error("terminal executions must not be updated");
      }
    },
    outboxMessage: {
      findMany: async () => []
    }
  } as unknown as PrismaClient;

  await processWorkflowExecution(validMessage(), channel, prisma, testAiOrchestratorClient);

  assert.equal(channel.published.length, 0);
});

test("executes workflow nodes sequentially and publishes node lifecycle events", async () => {
  const channel = createFakeChannel();
  const aiPromptRequests: AiPromptRunInput[] = [];
  const workflowUpdates: unknown[] = [];
  const nodeUpserts: unknown[] = [];
  const nodeUpdates: unknown[] = [];
  const outboxUpserts: unknown[] = [];
  const aiTraceCreates: unknown[] = [];
  const prisma = {
    workflowExecution: {
      findUnique: async () => ({
        id: "execution-1",
        workflowId: "workflow-1",
        workspaceId: "workspace-1",
        status: "PENDING",
        startedAt: null,
        workflowVersion: {
          definition: workflowDefinition()
        }
      }),
      updateMany: async (args: unknown) => {
        workflowUpdates.push(args);
        return { count: 1 };
      }
    },
    workflowNodeExecution: {
      upsert: async (args: { create: { nodeId: string; nodeType: string } }) => {
        nodeUpserts.push(args);
        return {
          id: `node-execution-${args.create.nodeId}`,
          nodeId: args.create.nodeId,
          nodeType: args.create.nodeType
        };
      },
      update: async (args: unknown) => {
        nodeUpdates.push(args);
        return args;
      }
    },
    outboxMessage: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        outboxUpserts.push(args);
        return createOutboxRecordFromCreate(args.create);
      },
      update: async (args: unknown) => args
    },
    workflowAiTrace: {
      create: async (args: { data: Record<string, unknown> }) => {
        aiTraceCreates.push(args);
        return createAiTraceRecordFromCreate(args.data);
      }
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      return callback(prisma);
    }
  } as unknown as PrismaClient;

  await processWorkflowExecution(
    validMessage(),
    channel,
    prisma,
    createFakeAiOrchestratorClient(aiPromptRequests)
  );

  assert.equal(nodeUpserts.length, 4);
  assert.equal(nodeUpdates.length, 4);
  assert.equal(aiTraceCreates.length, 1);
  assert.equal(workflowUpdates.length, 2);
  assert.equal(channel.published.length, 11);
  assert.deepEqual(aiPromptRequests, [
    {
      workspaceId: "workspace-1",
      workflowId: "workflow-1",
      executionId: "execution-1",
      nodeExecutionId: "node-execution-ai-summary",
      nodeId: "ai-summary",
      correlationId: "workflow-execution:execution-1",
      input: {
        status: "mocked",
        request: {
          method: "POST",
          mode: "mock",
          url: "https://example.com/api/enrich-lead",
          headers: {},
          body: {
            input: {
              leadId: "lead-1"
            }
          }
        },
        response: {
          statusCode: 200,
          body: {
            ok: true,
            echoedInput: {
              leadId: "lead-1"
            }
          }
        }
      },
      prompt: "Summarize this lead.",
      provider: "deterministic",
      credentialId: "credential-1",
      model: "mock-flowpilot-llm",
      systemPrompt: "You summarize CRM leads.",
      temperature: 0.2
    }
  ]);
  assert.deepEqual(
    channel.published.map((published) => published.routingKey),
    [
      FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionStarted,
      FLOWPILOT_ROUTING_KEYS.aiTraceCreated,
      FLOWPILOT_ROUTING_KEYS.nodeExecutionCompleted,
      FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted
    ]
  );

  const workflowCompletion = workflowUpdates[1] as {
    data?: { output?: { finalOutput?: { provider?: string; trace?: { inputKeys?: string[] } } } };
  };
  assert.equal(workflowCompletion.data?.output?.finalOutput?.provider, "flowpilot-mock-ai");
  assert.deepEqual(workflowCompletion.data?.output?.finalOutput?.trace?.inputKeys, [
    "request",
    "response",
    "status"
  ]);

  const aiTraceCreate = aiTraceCreates[0] as {
    data: {
      nodeExecutionId: string;
      provider: string;
      model: string;
      status: string;
      inputTokenCount: number;
      outputTokenCount: number;
      totalTokenCount: number;
      estimatedCostUsd: number | null;
      providerLatencyMs: number | null;
      finishReason: string | null;
      schemaValid: boolean;
    };
  };
  assert.equal(aiTraceCreate.data.nodeExecutionId, "node-execution-ai-summary");
  assert.equal(aiTraceCreate.data.provider, "deterministic");
  assert.equal(aiTraceCreate.data.model, "mock-flowpilot-llm");
  assert.equal(aiTraceCreate.data.status, "SUCCEEDED");
  assert.equal(aiTraceCreate.data.inputTokenCount, 1);
  assert.equal(aiTraceCreate.data.outputTokenCount, 12);
  assert.equal(aiTraceCreate.data.totalTokenCount, 13);
  assert.equal(aiTraceCreate.data.estimatedCostUsd, 0);
  assert.equal(aiTraceCreate.data.providerLatencyMs, 0);
  assert.equal(aiTraceCreate.data.finishReason, "deterministic");
  assert.equal(aiTraceCreate.data.schemaValid, true);

  const aiTraceCreatedEvent = channel.published.find(
    (published) => published.routingKey === FLOWPILOT_ROUTING_KEYS.aiTraceCreated
  );
  const aiTraceCreatedMessage = JSON.parse(
    aiTraceCreatedEvent?.content.toString("utf8") ?? "{}"
  ) as {
    payload?: {
      traceId?: string;
      provider?: string;
      tokenUsage?: { totalTokens?: number };
      estimatedCostUsd?: number | null;
      providerLatencyMs?: number | null;
      finishReason?: string | null;
    };
  };
  assert.equal(aiTraceCreatedMessage.payload?.traceId, "ai-trace-1");
  assert.equal(aiTraceCreatedMessage.payload?.provider, "deterministic");
  assert.equal(aiTraceCreatedMessage.payload?.tokenUsage?.totalTokens, 13);
  assert.equal(aiTraceCreatedMessage.payload?.estimatedCostUsd, 0);
  assert.equal(aiTraceCreatedMessage.payload?.providerLatencyMs, 0);
  assert.equal(aiTraceCreatedMessage.payload?.finishReason, "deterministic");
});

test("schedules retry and acknowledges retryable failures before max attempts", async () => {
  const channel = createFakeChannel();
  const prisma = {
    workflowExecution: {
      findUnique: async () => {
        throw new Error("temporary database outage");
      }
    }
  } as unknown as PrismaClient;

  await handleDelivery(
    createConsumeMessage(validMessage()),
    channel,
    prisma,
    testAiOrchestratorClient
  );

  assert.equal(channel.acked, true);
  assert.equal(channel.nacked, false);
  assert.equal(channel.published.length, 1);
  assert.equal(channel.published[0]?.exchange, FLOWPILOT_EXCHANGES.retry);
  assert.equal(
    channel.published[0]?.routingKey,
    FLOWPILOT_RETRY_ROUTING_KEYS.workflowExecutionRequested10s
  );
  assert.equal(channel.published[0]?.options.headers["x-flowpilot-retry-attempt"], 1);
});

test("schedules retry when AI orchestrator failures are retryable", async () => {
  const channel = createFakeChannel();
  const prisma = createWorkflowExecutionPrisma();
  const aiOrchestratorClient = createFailingAiOrchestratorClient(
    new AiOrchestratorClientError(
      "ai_orchestrator_timeout",
      "AI orchestrator request timed out after 5000ms",
      true
    )
  );

  await handleDelivery(createConsumeMessage(validMessage()), channel, prisma, aiOrchestratorClient);

  const retryMessage = channel.published.find(
    (published) => published.exchange === FLOWPILOT_EXCHANGES.retry
  );
  const failedWorkflowEvent = channel.published.find(
    (published) => published.routingKey === FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed
  );

  assert.equal(channel.acked, true);
  assert.equal(channel.nacked, false);
  assert.equal(retryMessage?.routingKey, FLOWPILOT_RETRY_ROUTING_KEYS.workflowExecutionRequested10s);
  assert.equal(failedWorkflowEvent, undefined);
});

test("dead-letters without retry when AI orchestrator failures are non-retryable", async () => {
  const channel = createFakeChannel();
  const aiTraceCreates: unknown[] = [];
  const prisma = createWorkflowExecutionPrisma(aiTraceCreates);
  const aiOrchestratorClient = createFailingAiOrchestratorClient(
    new AiOrchestratorClientError(
      "unknown_ai_provider",
      "Unknown AI provider: unknown",
      false,
      422
    )
  );

  await handleDelivery(createConsumeMessage(validMessage()), channel, prisma, aiOrchestratorClient);

  const retryMessage = channel.published.find(
    (published) => published.exchange === FLOWPILOT_EXCHANGES.retry
  );
  const failedWorkflowEvent = channel.published.find(
    (published) => published.routingKey === FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed
  );
  const deadLetter = channel.published.find(
    (published) => published.exchange === FLOWPILOT_EXCHANGES.dlx
  );
  const failedMessage = JSON.parse(failedWorkflowEvent?.content.toString("utf8") ?? "{}") as {
    payload?: { error?: { code?: string; retryable?: boolean } };
  };

  assert.equal(channel.acked, true);
  assert.equal(channel.nacked, false);
  assert.equal(retryMessage, undefined);
  assert.equal(deadLetter?.routingKey, FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested);
  assert.equal(deadLetter?.options.headers["x-flowpilot-dead-letter-code"], "unknown_ai_provider");
  assert.equal(failedMessage.payload?.error?.code, "unknown_ai_provider");
  assert.equal(failedMessage.payload?.error?.retryable, false);

  const aiTraceCreate = aiTraceCreates[0] as {
    data: {
      status: string;
      errorCode: string;
      errorMessage: string;
      providerStatusCode: number | null;
      retryable: boolean;
    };
  };
  assert.equal(aiTraceCreate.data.status, "FAILED");
  assert.equal(aiTraceCreate.data.errorCode, "unknown_ai_provider");
  assert.equal(aiTraceCreate.data.errorMessage, "Unknown AI provider: unknown");
  assert.equal(aiTraceCreate.data.providerStatusCode, null);
  assert.equal(aiTraceCreate.data.retryable, false);
});

test("marks failed, publishes failed event, and dead-letters after max retries", async () => {
  const channel = createFakeChannel();
  const outboxRecord = createOutboxRecord(FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed);
  const prisma = {
    workflowExecution: {
      findUnique: async () => {
        throw new Error("permanent worker failure");
      },
      updateMany: async () => ({ count: 1 })
    },
    outboxMessage: {
      upsert: async () => outboxRecord,
      update: async () => ({
        ...outboxRecord,
        status: "PUBLISHED",
        attempts: 1,
        publishedAt: new Date("2026-05-02T12:00:01.000Z")
      })
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      return callback(prisma);
    }
  } as unknown as PrismaClient;

  await handleDelivery(
    createConsumeMessage(validMessage(), {
      headers: {
        "x-flowpilot-retry-attempt": 3
      }
    }),
    channel,
    prisma,
    testAiOrchestratorClient
  );

  assert.equal(channel.acked, true);
  assert.equal(channel.nacked, false);
  assert.equal(channel.published.length, 2);
  assert.equal(channel.published[0]?.exchange, FLOWPILOT_EXCHANGES.events);
  assert.equal(channel.published[0]?.routingKey, FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed);
  assert.equal(channel.published[1]?.exchange, FLOWPILOT_EXCHANGES.dlx);
  assert.equal(channel.published[1]?.routingKey, FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested);

  const failedMessage = JSON.parse(channel.published[0]?.content.toString("utf8") ?? "{}") as {
    payload?: { error?: { retryable?: boolean } };
  };
  assert.equal(failedMessage.payload?.error?.retryable, true);
});

test("dispatches pending outbox messages and marks them as published", async () => {
  const channel = createFakeChannel();
  const outboxRecord = createOutboxRecord(FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted);
  const updates: unknown[] = [];
  const prisma = {
    outboxMessage: {
      findMany: async () => [outboxRecord],
      update: async (args: unknown) => {
        updates.push(args);
        return {
          ...outboxRecord,
          status: "PUBLISHED",
          attempts: 1,
          publishedAt: new Date("2026-05-02T12:00:02.000Z")
        };
      }
    }
  } as unknown as PrismaClient;

  const result = await dispatchPendingOutboxMessages(channel, prisma);

  assert.deepEqual(result, { failed: 0, fetched: 1, published: 1 });
  assert.equal(channel.published.length, 1);
  assert.equal(channel.published[0]?.exchange, FLOWPILOT_EXCHANGES.events);
  assert.equal(channel.published[0]?.routingKey, FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted);
  assert.equal(updates.length, 1);
});

test("records outbox publish failures without stopping the batch", async () => {
  const channel = createFakeChannel({ publishResults: [false, true] });
  const failedRecord = {
    ...createOutboxRecord(FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed),
    attempts: 4,
    id: "outbox-failed"
  };
  const publishedRecord = {
    ...createOutboxRecord(FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted),
    id: "outbox-published",
    idempotencyKey: "workflow.execution.completed:execution-1"
  };
  const updates: Array<{ data?: { status?: string } }> = [];
  const prisma = {
    outboxMessage: {
      findMany: async () => [failedRecord, publishedRecord],
      update: async (args: { data?: { status?: string } }) => {
        updates.push(args);
        return args;
      }
    }
  } as unknown as PrismaClient;

  const result = await dispatchPendingOutboxMessages(channel, prisma);

  assert.deepEqual(result, { failed: 1, fetched: 2, published: 1 });
  assert.equal(channel.published.length, 2);
  assert.equal(updates[0]?.data?.status, "FAILED");
  assert.equal(updates[1]?.data?.status, "PUBLISHED");
});

test("limits pending outbox dispatch batches", async () => {
  const channel = createFakeChannel();
  const findManyArgs: unknown[] = [];
  const prisma = {
    outboxMessage: {
      findMany: async (args: unknown) => {
        findManyArgs.push(args);
        return [];
      }
    }
  } as unknown as PrismaClient;

  const result = await dispatchPendingOutboxMessages(channel, prisma, 2);

  assert.deepEqual(result, { failed: 0, fetched: 0, published: 0 });
  assert.deepEqual(findManyArgs, [
    {
      orderBy: {
        createdAt: "asc"
      },
      take: 2,
      where: {
        attempts: {
          lt: 5
        },
        status: "PENDING"
      }
    }
  ]);
});

function validMessage(): WorkflowExecutionRequestedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
    eventId: "event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-02T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "workflow-execution:execution-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    actor: {
      type: "user",
      id: "user-1"
    },
    idempotencyKey: "workflow.execution.requested:execution-1",
    payload: {
      workflowId: "workflow-1",
      workflowVersion: 1,
      executionId: "execution-1",
      requestedBy: {
        type: "user",
        id: "user-1"
      },
      input: {
        leadId: "lead-1",
        email: "lead@example.test",
        ignored: "ignored"
      }
    }
  };
}

function workflowDefinition(): WorkflowDefinition {
  return {
    nodes: [
      {
        id: "manual-trigger",
        type: WORKFLOW_NODE_TYPES.manualTrigger,
        name: "Manual Trigger",
        config: {}
      },
      {
        id: "normalize-lead",
        type: WORKFLOW_NODE_TYPES.transformAction,
        name: "Normalize Lead",
        config: {
          mode: "pick",
          pick: ["leadId"]
        }
      },
      {
        id: "enrichment-request",
        type: WORKFLOW_NODE_TYPES.httpRequestAction,
        name: "Request Enrichment",
        config: {
          mode: "mock",
          method: "POST",
          url: "https://example.com/api/enrich-lead",
          timeoutMs: 5000
        }
      },
      {
        id: "ai-summary",
        type: WORKFLOW_NODE_TYPES.aiPromptAction,
        name: "AI Summary",
        config: {
          provider: "deterministic",
          credentialId: "credential-1",
          model: "mock-flowpilot-llm",
          systemPrompt: "You summarize CRM leads.",
          prompt: "Summarize this lead.",
          temperature: 0.2
        }
      }
    ],
    edges: [
      {
        id: "edge-manual-to-normalize",
        sourceNodeId: "manual-trigger",
        targetNodeId: "normalize-lead"
      },
      {
        id: "edge-normalize-to-enrichment",
        sourceNodeId: "normalize-lead",
        targetNodeId: "enrichment-request"
      },
      {
        id: "edge-enrichment-to-ai-summary",
        sourceNodeId: "enrichment-request",
        targetNodeId: "ai-summary"
      }
    ]
  };
}

function createConsumeMessage(
  payload: unknown,
  options: { headers?: Record<string, unknown> } = {}
): ConsumeMessage {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);

  return {
    content: Buffer.from(body),
    fields: {
      consumerTag: "test",
      deliveryTag: 1,
      redelivered: false,
      exchange: "flowpilot.commands",
      routingKey: FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
    },
    properties: {
      contentType: "application/json",
      contentEncoding: undefined,
      headers: options.headers ?? {},
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

type FakeChannel = Channel & {
  acked: boolean;
  nacked: boolean;
  published: Array<{
    exchange: string;
    routingKey: string;
    content: Buffer;
    options: { headers: Record<string, unknown> };
  }>;
};

function createFakeChannel(options: { publishResults?: boolean[] } = {}) {
  const channel = {
    acked: false,
    nacked: false,
    published: [] as Array<{
      exchange: string;
      routingKey: string;
      content: Buffer;
      options: { headers: Record<string, unknown> };
    }>,
    ack() {
      channel.acked = true;
    },
    nack() {
      channel.nacked = true;
    },
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      publishOptions: { headers?: Record<string, unknown> } = {}
    ) {
      channel.published.push({
        exchange,
        routingKey,
        content,
        options: {
          headers: publishOptions.headers ?? {}
        }
      });
      return options.publishResults?.shift() ?? true;
    }
  };

  return channel as unknown as FakeChannel;
}

function createFakeAiOrchestratorClient(requests: AiPromptRunInput[] = []) {
  return {
    async runPrompt(request: AiPromptRunInput) {
      requests.push(request);
      const inputKeys = Object.keys(request.input).sort();

      return {
        provider: "flowpilot-mock-ai",
        model: request.model,
        prompt: request.prompt,
        temperature: request.temperature,
        summary: `Mock AI response for ${inputKeys.length} input fields: ${
          inputKeys.join(", ") || "none"
        }.`,
        tokens: {
          input: 1,
          output: 12
        },
        trace: {
          deterministic: true,
          finishReason: "deterministic",
          inputKeys,
          providerLatencyMs: 0
        }
      };
    }
  } as unknown as AiOrchestratorClient;
}

function createFailingAiOrchestratorClient(error: AiOrchestratorClientError) {
  return {
    async runPrompt() {
      throw error;
    }
  } as unknown as AiOrchestratorClient;
}

function createWorkflowExecutionPrisma(aiTraceCreates: unknown[] = []) {
  const prisma = {
    workflowExecution: {
      findUnique: async () => ({
        id: "execution-1",
        workflowId: "workflow-1",
        workspaceId: "workspace-1",
        status: "PENDING",
        startedAt: null,
        workflowVersion: {
          definition: workflowDefinition()
        }
      }),
      updateMany: async () => ({ count: 1 })
    },
    workflowNodeExecution: {
      upsert: async (args: { create: { nodeId: string; nodeType: string } }) => ({
        id: `node-execution-${args.create.nodeId}`,
        nodeId: args.create.nodeId,
        nodeType: args.create.nodeType
      }),
      update: async (args: unknown) => args
    },
    outboxMessage: {
      upsert: async (args: { create: Record<string, unknown> }) =>
        createOutboxRecordFromCreate(args.create),
      update: async (args: { where?: { id?: string } }) => ({
        ...createOutboxRecord(FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed),
        id: args.where?.id ?? "outbox-1",
        status: "PUBLISHED",
        attempts: 1,
        publishedAt: new Date("2026-05-02T12:00:01.000Z")
      })
    },
    workflowAiTrace: {
      create: async (args: { data: Record<string, unknown> }) => {
        aiTraceCreates.push(args);
        return createAiTraceRecordFromCreate(args.data);
      }
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      return callback(prisma);
    }
  };

  return prisma as unknown as PrismaClient;
}

function createAiTraceRecordFromCreate(data: Record<string, unknown>) {
  return {
    id: "ai-trace-1",
    workspaceId: data.workspaceId,
    workflowId: data.workflowId,
    workflowExecutionId: data.workflowExecutionId,
    nodeExecutionId: data.nodeExecutionId,
    nodeId: data.nodeId,
    provider: data.provider,
    model: data.model,
    status: data.status,
    latencyMs: data.latencyMs,
    inputTokenCount: data.inputTokenCount ?? 0,
    outputTokenCount: data.outputTokenCount ?? 0,
    totalTokenCount: data.totalTokenCount ?? 0,
    estimatedCostUsd: data.estimatedCostUsd ?? null,
    errorCode: data.errorCode ?? null,
    providerStatusCode: data.providerStatusCode ?? null,
    retryable: data.retryable ?? null,
    createdAt: new Date("2026-05-02T12:00:01.000Z")
  };
}

function createOutboxRecord(routingKey: string) {
  const message = validMessage();
  const failedEvent = {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
    eventId: "failed-event-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-05-02T12:00:01.000Z",
    workspaceId: message.workspaceId,
    correlationId: message.correlationId,
    causationId: message.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.executionWorker,
    idempotencyKey: "workflow.execution.failed:execution-1",
    payload: {
      workflowId: message.payload.workflowId,
      executionId: message.payload.executionId,
      error: {
        code: "workflow_execution_worker_error",
        message: "permanent worker failure",
        retryable: true
      }
    }
  };

  return {
    id: "outbox-1",
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey,
    eventName: failedEvent.eventName,
    messageId: failedEvent.eventId,
    idempotencyKey: failedEvent.idempotencyKey,
    payload: failedEvent,
    headers: {
      correlationId: failedEvent.correlationId,
      producer: failedEvent.producer,
      schemaVersion: failedEvent.schemaVersion,
      workspaceId: failedEvent.workspaceId
    },
    status: "PENDING",
    attempts: 0,
    lastError: null,
    publishedAt: null,
    createdAt: new Date("2026-05-02T12:00:01.000Z"),
    updatedAt: new Date("2026-05-02T12:00:01.000Z")
  };
}

function createOutboxRecordFromCreate(create: Record<string, unknown>) {
  return {
    id: `outbox-${String(create.idempotencyKey)}`,
    exchange: create.exchange,
    routingKey: create.routingKey,
    eventName: create.eventName,
    messageId: create.messageId,
    idempotencyKey: create.idempotencyKey,
    payload: create.payload,
    headers: create.headers,
    status: "PENDING",
    attempts: 0,
    lastError: null,
    publishedAt: null,
    createdAt: new Date("2026-05-02T12:00:01.000Z"),
    updatedAt: new Date("2026-05-02T12:00:01.000Z")
  };
}
