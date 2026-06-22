import assert from "node:assert/strict";
import { test } from "node:test";

import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client/index";
import {
  DEFAULT_WORKFLOW_DEFINITION,
  FLOWPILOT_ROUTING_KEYS,
  WORKFLOW_NODE_TYPES,
  type WorkflowDefinition
} from "@flowpilot/contracts";

import { WorkflowsService } from "./workflows.service.js";

const WORKFLOW_STATUS_DRAFT = "DRAFT";
const WORKFLOW_EXECUTION_STATUS_PENDING = "PENDING";
const WORKFLOW_NODE_EXECUTION_STATUS_PENDING = "PENDING";

test("WorkflowsService creates a workflow with an initial draft version", async () => {
  const workflow = workflowFixture();
  const prisma = {
    workflow: {
      create: mockAsync(workflow)
    }
  };
  const messagingService = fakeMessagingService();
  const service = new WorkflowsService(prisma as never, messagingService);

  const result = await service.create("workspace-1", {
    name: "Lead Enrichment",
    slug: "lead-enrichment"
  }, "user-1");

  assert.equal(result.id, "workflow-1");
  assert.equal(result.status, WORKFLOW_STATUS_DRAFT);
  assert.equal(result.currentVersion.version, 1);
  assert.deepEqual(result.currentVersion.definition, DEFAULT_WORKFLOW_DEFINITION);

  const createArgs = prisma.workflow.create.calls[0]?.[0] as {
    data: {
      workspaceId: string;
      status: typeof WORKFLOW_STATUS_DRAFT;
      versions: { create: { version: number; definition: unknown } };
    };
  };

  assert.equal(createArgs.data.workspaceId, "workspace-1");
  assert.equal(createArgs.data.status, WORKFLOW_STATUS_DRAFT);
  assert.equal(createArgs.data.versions.create.version, 1);
  assert.deepEqual(createArgs.data.versions.create.definition, DEFAULT_WORKFLOW_DEFINITION);
  assert.equal(messagingService.publishEvent.calls[0]?.[0], FLOWPILOT_ROUTING_KEYS.workflowCreated);
  const workflowCreatedMessage = messagingService.publishEvent.calls[0]?.[1] as {
    actor: { id: string };
    payload: { workflowId: string };
  };
  assert.equal(workflowCreatedMessage.payload.workflowId, "workflow-1");
  assert.equal(workflowCreatedMessage.actor.id, "user-1");
});

test("WorkflowsService creates a workflow with a validated definition", async () => {
  const workflow = workflowFixture();
  const definition = workflowDefinitionFixture();
  const prisma = {
    workflow: {
      create: mockAsync(workflow)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await service.create("workspace-1", {
    name: "Lead Enrichment",
    slug: "lead-enrichment",
    definition
  }, "user-1");

  const createArgs = prisma.workflow.create.calls[0]?.[0] as {
    data: {
      versions: { create: { definition: unknown } };
    };
  };

  assert.deepEqual(createArgs.data.versions.create.definition, definition);
});

test("WorkflowsService throws ConflictException for duplicate workflow slug", async () => {
  const prisma = {
    workflow: {
      create: mockReject(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test"
        })
      )
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () =>
      service.create("workspace-1", {
        name: "Lead Enrichment",
        slug: "lead-enrichment"
      }, "user-1"),
    ConflictException
  );
});

test("WorkflowsService lists workflows for a workspace", async () => {
  const workflows = [workflowFixture()];
  const prisma = {
    workflow: {
      findMany: mockAsync(workflows)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findAllForWorkspace("workspace-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.workspaceId, "workspace-1");

  const findManyArgs = prisma.workflow.findMany.calls[0]?.[0] as {
    where: { workspaceId: string };
    orderBy: { updatedAt: "desc" };
  };

  assert.equal(findManyArgs.where.workspaceId, "workspace-1");
  assert.equal(findManyArgs.orderBy.updatedAt, "desc");
});

test("WorkflowsService throws NotFoundException when workflow is missing", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(() => service.findOne("workspace-1", "missing-workflow"), NotFoundException);
});

test("WorkflowsService saves workflow definitions as a new immutable version", async () => {
  const workflow = workflowFixture();
  const nextWorkflow = workflowFixture({
    currentVersion: 2,
    currentVersionId: "version-2",
    definition: workflowDefinitionFixture()
  });
  const prisma = {
    workflow: {
      findFirst: mockAsync(workflow),
      update: mockAsync(nextWorkflow)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());
  const definition = workflowDefinitionFixture();

  const result = await service.createVersion("workspace-1", "workflow-1", { definition });

  assert.equal(result.currentVersion.version, 2);
  assert.deepEqual(result.currentVersion.definition, definition);

  const updateArgs = prisma.workflow.update.calls[0]?.[0] as {
    where: { id: string };
    data: { versions: { create: { version: number; definition: unknown } } };
  };

  assert.equal(updateArgs.where.id, "workflow-1");
  assert.equal(updateArgs.data.versions.create.version, 2);
  assert.deepEqual(updateArgs.data.versions.create.definition, definition);
});

test("WorkflowsService lists workflow versions newest first", async () => {
  const versions = [
    workflowVersionFixture({ id: "version-2", version: 2 }),
    workflowVersionFixture({ id: "version-1", version: 1 })
  ];
  const prisma = {
    workflow: {
      findFirst: mockAsync({ id: "workflow-1" })
    },
    workflowVersion: {
      findMany: mockAsync(versions)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findVersions("workspace-1", "workflow-1");

  assert.equal(result.length, 2);
  assert.equal(result[0]?.version, 2);

  const findManyArgs = prisma.workflowVersion.findMany.calls[0]?.[0] as {
    where: { workflowId: string };
    orderBy: { version: "desc" };
  };

  assert.equal(findManyArgs.where.workflowId, "workflow-1");
  assert.equal(findManyArgs.orderBy.version, "desc");
});

test("WorkflowsService rejects saving a new version for missing workflows", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.createVersion("workspace-1", "missing-workflow", { definition: workflowDefinitionFixture() }),
    NotFoundException
  );
});

test("WorkflowsService updates workflow metadata without creating a new version", async () => {
  const updatedWorkflow = {
    ...workflowFixture(),
    name: "Lead Routing",
    slug: "lead-routing",
    description: "Routes inbound leads.",
    status: "ACTIVE"
  };
  const prisma = {
    workflow: {
      findFirst: mockAsync({ id: "workflow-1" }),
      update: mockAsync(updatedWorkflow)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.updateMetadata("workspace-1", "workflow-1", {
    name: "Lead Routing",
    slug: "lead-routing",
    description: "Routes inbound leads.",
    status: "ACTIVE"
  });

  assert.equal(result.name, "Lead Routing");
  assert.equal(result.slug, "lead-routing");
  assert.equal(result.description, "Routes inbound leads.");
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.currentVersion.version, 1);

  const updateArgs = prisma.workflow.update.calls[0]?.[0] as {
    where: { id: string };
    data: { name: string; slug: string; description: string; status: string };
  };

  assert.equal(updateArgs.where.id, "workflow-1");
  assert.equal(updateArgs.data.name, "Lead Routing");
  assert.equal(updateArgs.data.slug, "lead-routing");
  assert.equal(updateArgs.data.description, "Routes inbound leads.");
  assert.equal(updateArgs.data.status, "ACTIVE");
});

test("WorkflowsService rejects metadata updates for missing workflows", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.updateMetadata("workspace-1", "missing-workflow", { name: "Missing" }),
    NotFoundException
  );
});

test("WorkflowsService restores an old version by creating a new immutable version", async () => {
  const workflow = workflowFixture({ currentVersion: 3, currentVersionId: "version-3" });
  const sourceVersion = workflowVersionFixture({
    id: "version-1",
    version: 1,
    definition: workflowDefinitionFixture()
  });
  const updatedWorkflow = workflowFixture({
    currentVersion: 4,
    currentVersionId: "version-4",
    definition: workflowDefinitionFixture()
  });
  const prisma = {
    workflow: {
      findFirst: mockAsync(workflow),
      update: mockAsync(updatedWorkflow)
    },
    workflowVersion: {
      findFirst: mockAsync(sourceVersion)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.restoreVersion("workspace-1", "workflow-1", "version-1");

  assert.equal(result.currentVersion.version, 4);
  assert.deepEqual(result.currentVersion.definition, sourceVersion.definition);

  const updateArgs = prisma.workflow.update.calls[0]?.[0] as {
    data: { versions: { create: { version: number; definition: unknown } } };
  };

  assert.equal(updateArgs.data.versions.create.version, 4);
  assert.deepEqual(updateArgs.data.versions.create.definition, sourceVersion.definition);
});

test("WorkflowsService rejects restoring missing workflow versions", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(workflowFixture())
    },
    workflowVersion: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.restoreVersion("workspace-1", "workflow-1", "missing-version"),
    NotFoundException
  );
});

test("WorkflowsService requests a workflow execution and publishes an event", async () => {
  const workflow = workflowFixture();
  const execution = workflowExecutionFixture();
  const prisma = {
    workflow: {
      findFirst: mockAsync(workflow)
    },
    workflowExecution: {
      create: mockAsync(execution)
    }
  };
  const messagingService = fakeMessagingService();
  const service = new WorkflowsService(prisma as never, messagingService);

  const result = await service.requestExecution(
    "workspace-1",
    "workflow-1",
    {
      input: {
        leadId: "lead-1"
      }
    },
    "user-1"
  );

  assert.equal(result.id, "execution-1");
  assert.equal(result.status, WORKFLOW_EXECUTION_STATUS_PENDING);
  assert.deepEqual(result.input, { leadId: "lead-1" });

  const createArgs = prisma.workflowExecution.create.calls[0]?.[0] as {
    data: {
      workspaceId: string;
      workflowId: string;
      workflowVersionId: string;
      requestedByUserId: string;
      status: typeof WORKFLOW_EXECUTION_STATUS_PENDING;
      input: unknown;
    };
  };

  assert.equal(createArgs.data.workspaceId, "workspace-1");
  assert.equal(createArgs.data.workflowId, "workflow-1");
  assert.equal(createArgs.data.workflowVersionId, "version-1");
  assert.equal(createArgs.data.requestedByUserId, "user-1");
  assert.equal(createArgs.data.status, WORKFLOW_EXECUTION_STATUS_PENDING);
  assert.deepEqual(createArgs.data.input, { leadId: "lead-1" });

  const [routingKey, message] = messagingService.publishEvent.calls[0] ?? [];
  assert.equal(routingKey, FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested);
  const executionMessage = message as {
    payload: {
      executionId: string;
      workflowId: string;
      workflowVersion: number;
      input: Record<string, unknown>;
    };
  };
  assert.equal(executionMessage.payload.executionId, "execution-1");
  assert.equal(executionMessage.payload.workflowId, "workflow-1");
  assert.equal(executionMessage.payload.workflowVersion, 1);
  assert.deepEqual(executionMessage.payload.input, { leadId: "lead-1" });
});

test("WorkflowsService rejects execution requests for missing workflows", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.requestExecution("workspace-1", "missing-workflow", {}, "user-1"),
    NotFoundException
  );
});

test("WorkflowsService lists executions after confirming workflow ownership", async () => {
  const executions = [workflowExecutionFixture()];
  const prisma = {
    workflow: {
      findFirst: mockAsync({ id: "workflow-1" })
    },
    workflowExecution: {
      findMany: mockAsync(executions)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecutions("workspace-1", "workflow-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "execution-1");

  const findManyArgs = prisma.workflowExecution.findMany.calls[0]?.[0] as {
    where: { workspaceId: string; workflowId: string };
    orderBy: { createdAt: "desc" };
  };

  assert.equal(findManyArgs.where.workspaceId, "workspace-1");
  assert.equal(findManyArgs.where.workflowId, "workflow-1");
  assert.equal(findManyArgs.orderBy.createdAt, "desc");
});

test("WorkflowsService rejects listing executions for missing workflows", async () => {
  const prisma = {
    workflow: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecutions("workspace-1", "missing-workflow"),
    NotFoundException
  );
});

test("WorkflowsService returns execution details", async () => {
  const execution = workflowExecutionFixture();
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(execution)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecution("workspace-1", "workflow-1", "execution-1");

  assert.equal(result.id, "execution-1");
  assert.equal(result.workflowId, "workflow-1");

  const findFirstArgs = prisma.workflowExecution.findFirst.calls[0]?.[0] as {
    where: { id: string; workspaceId: string; workflowId: string };
  };

  assert.equal(findFirstArgs.where.id, "execution-1");
  assert.equal(findFirstArgs.where.workspaceId, "workspace-1");
  assert.equal(findFirstArgs.where.workflowId, "workflow-1");
});

test("WorkflowsService rejects missing execution details", async () => {
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecution("workspace-1", "workflow-1", "missing-execution"),
    NotFoundException
  );
});

test("WorkflowsService lists workflow execution events after confirming execution ownership", async () => {
  const events = [workflowExecutionEventFixture()];
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync({ id: "execution-1" })
    },
    workflowExecutionEvent: {
      findMany: mockAsync(events)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecutionEvents("workspace-1", "workflow-1", "execution-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted);

  const findManyArgs = prisma.workflowExecutionEvent.findMany.calls[0]?.[0] as {
    where: { executionId: string; workspaceId: string; workflowId: string };
    orderBy: { occurredAt: "asc" };
  };

  assert.equal(findManyArgs.where.workspaceId, "workspace-1");
  assert.equal(findManyArgs.where.workflowId, "workflow-1");
  assert.equal(findManyArgs.where.executionId, "execution-1");
  assert.equal(findManyArgs.orderBy.occurredAt, "asc");
});

test("WorkflowsService rejects execution event listing for missing executions", async () => {
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecutionEvents("workspace-1", "workflow-1", "missing-execution"),
    NotFoundException
  );
});

test("WorkflowsService lists workflow node executions after confirming execution ownership", async () => {
  const nodeExecutions = [workflowNodeExecutionFixture()];
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync({ id: "execution-1" })
    },
    workflowNodeExecution: {
      findMany: mockAsync(nodeExecutions)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecutionNodes("workspace-1", "workflow-1", "execution-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.nodeId, "normalize-lead");
  assert.equal(result[0]?.status, WORKFLOW_NODE_EXECUTION_STATUS_PENDING);

  const findManyArgs = prisma.workflowNodeExecution.findMany.calls[0]?.[0] as {
    where: { executionId: string; workspaceId: string; workflowId: string };
    orderBy: { createdAt: "asc" };
  };

  assert.equal(findManyArgs.where.workspaceId, "workspace-1");
  assert.equal(findManyArgs.where.workflowId, "workflow-1");
  assert.equal(findManyArgs.where.executionId, "execution-1");
  assert.equal(findManyArgs.orderBy.createdAt, "asc");
});

test("WorkflowsService rejects node execution listing for missing executions", async () => {
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecutionNodes("workspace-1", "workflow-1", "missing-execution"),
    NotFoundException
  );
});

test("WorkflowsService returns execution summary with nodes and events", async () => {
  const execution = workflowExecutionFixture();
  const events = [workflowExecutionEventFixture()];
  const nodeExecutions = [workflowNodeExecutionFixture()];
  const aiTraces = [workflowAiTraceFixture()];
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(execution)
    },
    workflowExecutionEvent: {
      findMany: mockAsync(events)
    },
    workflowNodeExecution: {
      findMany: mockAsync(nodeExecutions)
    },
    workflowAiTrace: {
      findMany: mockAsync(aiTraces)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecutionSummary("workspace-1", "workflow-1", "execution-1");

  assert.equal(result.execution.id, "execution-1");
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]?.nodeId, "normalize-lead");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted);
  assert.equal(result.aiTraces.length, 1);
  assert.equal(result.aiTraces[0]?.provider, "openrouter");
  assert.equal(result.aiTraces[0]?.estimatedCostUsd, "0.000123");

  const nodeFindManyArgs = prisma.workflowNodeExecution.findMany.calls[0]?.[0] as {
    where: { executionId: string; workspaceId: string; workflowId: string };
    orderBy: { createdAt: "asc" };
  };
  const eventFindManyArgs = prisma.workflowExecutionEvent.findMany.calls[0]?.[0] as {
    where: { executionId: string; workspaceId: string; workflowId: string };
    orderBy: { occurredAt: "asc" };
  };
  const traceFindManyArgs = prisma.workflowAiTrace.findMany.calls[0]?.[0] as {
    where: { workflowExecutionId: string; workspaceId: string; workflowId: string };
    orderBy: { createdAt: "asc" };
  };

  assert.equal(nodeFindManyArgs.where.executionId, "execution-1");
  assert.equal(nodeFindManyArgs.orderBy.createdAt, "asc");
  assert.equal(eventFindManyArgs.where.executionId, "execution-1");
  assert.equal(eventFindManyArgs.orderBy.occurredAt, "asc");
  assert.equal(traceFindManyArgs.where.workflowExecutionId, "execution-1");
  assert.equal(traceFindManyArgs.orderBy.createdAt, "asc");
});

test("WorkflowsService returns execution diagnostics with retry and outbox state", async () => {
  const execution = workflowExecutionFixture({
    status: "FAILED",
    error: {
      code: "workflow_execution_worker_error",
      message: "Connector timeout",
      retryable: true
    }
  });
  const outboxMessages = [
    outboxMessageFixture({
      eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed,
      attempts: 2,
      status: "PUBLISHED"
    })
  ];
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(execution)
    },
    workflowExecutionEvent: {
      findMany: mockAsync([])
    },
    outboxMessage: {
      findMany: mockAsync(outboxMessages)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  const result = await service.findExecutionDiagnostics("workspace-1", "workflow-1", "execution-1");

  assert.equal(result.retry.attempts, 2);
  assert.equal(result.retry.deadLettered, true);
  assert.equal(result.retry.lastFailureCode, "workflow_execution_worker_error");
  assert.equal(result.retry.lastFailureMessage, "Connector timeout");
  assert.equal(result.retry.retryable, true);
  assert.equal(result.outbox.length, 1);
  assert.equal(result.outbox[0]?.eventName, FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed);

  const outboxFindManyArgs = prisma.outboxMessage.findMany.calls[0]?.[0] as {
    where: { idempotencyKey: { contains: string } };
  };
  assert.equal(outboxFindManyArgs.where.idempotencyKey.contains, "execution-1");
});

test("WorkflowsService rejects execution summary for missing executions", async () => {
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecutionSummary("workspace-1", "workflow-1", "missing-execution"),
    NotFoundException
  );
});

test("WorkflowsService rejects execution diagnostics for missing executions", async () => {
  const prisma = {
    workflowExecution: {
      findFirst: mockAsync(null)
    }
  };
  const service = new WorkflowsService(prisma as never, fakeMessagingService());

  await assert.rejects(
    () => service.findExecutionDiagnostics("workspace-1", "workflow-1", "missing-execution"),
    NotFoundException
  );
});

function workflowFixture({
  currentVersion = 1,
  currentVersionId = "version-1",
  definition = DEFAULT_WORKFLOW_DEFINITION
}: {
  currentVersion?: number;
  currentVersionId?: string;
  definition?: WorkflowDefinition;
} = {}) {
  const now = new Date("2026-05-01T12:00:00.000Z");

  return {
    id: "workflow-1",
    workspaceId: "workspace-1",
    name: "Lead Enrichment",
    slug: "lead-enrichment",
    description: null,
    status: WORKFLOW_STATUS_DRAFT,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: currentVersionId,
        workflowId: "workflow-1",
        version: currentVersion,
        definition,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function workflowExecutionFixture({
  error = null,
  status = WORKFLOW_EXECUTION_STATUS_PENDING
}: {
  error?: unknown;
  status?: string;
} = {}) {
  const now = new Date("2026-05-01T12:05:00.000Z");

  return {
    id: "execution-1",
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    workflowVersionId: "version-1",
    requestedByUserId: "user-1",
    status,
    input: {
      leadId: "lead-1"
    },
    output: null,
    error,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function outboxMessageFixture({
  attempts = 1,
  eventName = FLOWPILOT_ROUTING_KEYS.workflowExecutionCompleted,
  status = "PUBLISHED"
}: {
  attempts?: number;
  eventName?: string;
  status?: string;
} = {}) {
  const now = new Date("2026-05-01T12:05:02.000Z");

  return {
    id: "outbox-1",
    exchange: "flowpilot.events",
    routingKey: eventName,
    eventName,
    messageId: "message-1",
    idempotencyKey: `${eventName}:execution-1`,
    payload: {},
    headers: {},
    status,
    attempts,
    lastError: null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function workflowVersionFixture({
  id = "version-1",
  version = 1,
  definition = DEFAULT_WORKFLOW_DEFINITION
}: {
  id?: string;
  version?: number;
  definition?: WorkflowDefinition;
} = {}) {
  const now = new Date("2026-05-01T12:00:00.000Z");

  return {
    id,
    workflowId: "workflow-1",
    version,
    definition,
    createdAt: now,
    updatedAt: now
  };
}

function workflowExecutionEventFixture() {
  const now = new Date("2026-05-01T12:05:01.000Z");

  return {
    id: "event-row-1",
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    executionId: "execution-1",
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionStarted,
    eventId: "event-1",
    occurredAt: now,
    producer: "execution-worker",
    payload: {
      workflowId: "workflow-1",
      executionId: "execution-1"
    },
    createdAt: now
  };
}

function workflowNodeExecutionFixture() {
  const now = new Date("2026-05-01T12:05:01.000Z");

  return {
    id: "node-execution-1",
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    executionId: "execution-1",
    nodeId: "normalize-lead",
    nodeType: WORKFLOW_NODE_TYPES.transformAction,
    status: WORKFLOW_NODE_EXECUTION_STATUS_PENDING,
    input: {
      leadId: "lead-1",
      email: "lead@example.test"
    },
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function workflowAiTraceFixture() {
  const now = new Date("2026-05-01T12:05:02.000Z");

  return {
    id: "ai-trace-1",
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    workflowExecutionId: "execution-1",
    nodeExecutionId: "node-execution-1",
    nodeId: "ai-summary",
    credentialId: "credential-1",
    provider: "openrouter",
    model: "openai/gpt-oss-20b:free",
    status: "SUCCEEDED",
    latencyMs: 1234,
    providerLatencyMs: 1120,
    finishReason: "stop",
    inputTokenCount: 20,
    outputTokenCount: 10,
    totalTokenCount: 30,
    estimatedCostUsd: {
      toString: () => "0.000123"
    },
    inputSizeBytes: 128,
    outputSizeBytes: 256,
    schemaValid: true,
    errorCode: null,
    errorMessage: null,
    providerStatusCode: null,
    retryable: null,
    createdAt: now
  };
}

function workflowDefinitionFixture(): WorkflowDefinition {
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
          pick: ["leadId", "email"]
        }
      }
    ],
    edges: [
      {
        id: "edge-manual-to-normalize",
        sourceNodeId: "manual-trigger",
        targetNodeId: "normalize-lead"
      }
    ]
  };
}

function mockAsync<T>(value: T) {
  const calls: unknown[][] = [];
  const fn = async (...args: unknown[]) => {
    calls.push(args);
    return value;
  };

  return Object.assign(fn, { calls });
}

function mockReject(error: unknown) {
  const calls: unknown[][] = [];
  const fn = async (...args: unknown[]) => {
    calls.push(args);
    throw error;
  };

  return Object.assign(fn, { calls });
}

function fakeMessagingService() {
  return {
    publishEvent: mockAsync(undefined)
  };
}
