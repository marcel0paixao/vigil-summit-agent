import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type WorkflowAiTrace } from "@prisma/client/index";
import {
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  DEFAULT_WORKFLOW_DEFINITION,
  type WorkflowDefinition,
  type WorkflowCreatedMessage,
  type WorkflowExecutionRequestedMessage
} from "@flowpilot/contracts";
import { randomUUID } from "node:crypto";

import type { MessagePublisher } from "../messaging/message-publisher.js";
import { MESSAGE_PUBLISHER } from "../messaging/messaging.tokens.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateWorkflowExecutionDto } from "./dto/create-workflow-execution.dto.js";
import { CreateWorkflowDto } from "./dto/create-workflow.dto.js";
import { CreateWorkflowVersionDto } from "./dto/create-workflow-version.dto.js";
import { UpdateWorkflowDto } from "./dto/update-workflow.dto.js";

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MESSAGE_PUBLISHER)
    private readonly messagingService: MessagePublisher
  ) {}

  async create(workspaceId: string, dto: CreateWorkflowDto, actorUserId: string) {
    try {
      const workflow = await this.prisma.workflow.create({
        data: {
          workspaceId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          status: "DRAFT",
          versions: {
            create: {
              version: 1,
              definition: this.getInitialDefinition(dto.definition)
            }
          }
        },
        include: workflowWithCurrentVersion
      });

      const response = toWorkflowResponse(workflow);

      await this.messagingService.publishEvent(
        FLOWPILOT_ROUTING_KEYS.workflowCreated,
        createWorkflowCreatedMessage(response, actorUserId)
      );

      return response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Workflow slug already exists in this workspace");
      }

      throw error;
    }
  }

  async findAllForWorkspace(workspaceId: string) {
    const workflows = await this.prisma.workflow.findMany({
      where: {
        workspaceId
      },
      orderBy: {
        updatedAt: "desc"
      },
      include: workflowWithCurrentVersion
    });

    return workflows.map(toWorkflowResponse);
  }

  async findOne(workspaceId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        workspaceId
      },
      include: workflowWithCurrentVersion
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    return toWorkflowResponse(workflow);
  }

  async findVersions(workspaceId: string, workflowId: string) {
    await this.ensureWorkflowExists(workspaceId, workflowId);

    const versions = await this.prisma.workflowVersion.findMany({
      where: {
        workflowId
      },
      orderBy: {
        version: "desc"
      }
    });

    return versions.map(toWorkflowVersionResponse);
  }

  async updateMetadata(workspaceId: string, workflowId: string, dto: UpdateWorkflowDto) {
    await this.ensureWorkflowExists(workspaceId, workflowId);

    try {
      const workflow = await this.prisma.workflow.update({
        where: {
          id: workflowId
        },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {})
        },
        include: workflowWithCurrentVersion
      });

      return toWorkflowResponse(workflow);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Workflow slug already exists in this workspace");
      }

      throw error;
    }
  }

  async createVersion(workspaceId: string, workflowId: string, dto: CreateWorkflowVersionDto) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        workspaceId
      },
      include: workflowWithCurrentVersion
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const currentVersion = workflow.versions[0];

    if (!currentVersion) {
      throw new NotFoundException("Workflow version not found");
    }

    const nextVersion = currentVersion.version + 1;

    const updatedWorkflow = await this.prisma.workflow.update({
      where: {
        id: workflow.id
      },
      data: {
        versions: {
          create: {
            version: nextVersion,
            definition: dto.definition as Prisma.InputJsonObject
          }
        }
      },
      include: workflowWithCurrentVersion
    });

    return toWorkflowResponse(updatedWorkflow);
  }

  async restoreVersion(workspaceId: string, workflowId: string, versionId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        workspaceId
      },
      include: workflowWithCurrentVersion
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const sourceVersion = await this.prisma.workflowVersion.findFirst({
      where: {
        id: versionId,
        workflowId
      }
    });

    if (!sourceVersion) {
      throw new NotFoundException("Workflow version not found");
    }

    const currentVersion = workflow.versions[0];

    if (!currentVersion) {
      throw new NotFoundException("Workflow version not found");
    }

    const updatedWorkflow = await this.prisma.workflow.update({
      where: {
        id: workflow.id
      },
      data: {
        versions: {
          create: {
            version: currentVersion.version + 1,
            definition: sourceVersion.definition as Prisma.InputJsonObject
          }
        }
      },
      include: workflowWithCurrentVersion
    });

    return toWorkflowResponse(updatedWorkflow);
  }

  async requestExecution(
    workspaceId: string,
    workflowId: string,
    dto: CreateWorkflowExecutionDto,
    actorUserId: string
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        workspaceId
      },
      include: workflowWithCurrentVersion
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    const currentVersion = workflow.versions[0];

    if (!currentVersion) {
      throw new NotFoundException("Workflow version not found");
    }

    const execution = await this.prisma.workflowExecution.create({
      data: {
        workspaceId,
        workflowId,
        workflowVersionId: currentVersion.id,
        requestedByUserId: actorUserId,
        status: "PENDING",
        input: this.getExecutionInput(dto.input)
      }
    });

    const response = toWorkflowExecutionResponse(execution);

    await this.messagingService.publishEvent(
      FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
      createWorkflowExecutionRequestedMessage(response, currentVersion.version, actorUserId)
    );

    return response;
  }

  async findExecutions(workspaceId: string, workflowId: string) {
    await this.ensureWorkflowExists(workspaceId, workflowId);

    const executions = await this.prisma.workflowExecution.findMany({
      where: {
        workspaceId,
        workflowId
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return executions.map(toWorkflowExecutionResponse);
  }

  async findExecution(workspaceId: string, workflowId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        workspaceId,
        workflowId
      }
    });

    if (!execution) {
      throw new NotFoundException("Workflow execution not found");
    }

    return toWorkflowExecutionResponse(execution);
  }

  async findExecutionEvents(workspaceId: string, workflowId: string, executionId: string) {
    await this.ensureExecutionExists(workspaceId, workflowId, executionId);

    const events = await this.prisma.workflowExecutionEvent.findMany({
      where: {
        workspaceId,
        workflowId,
        executionId
      },
      orderBy: {
        occurredAt: "asc"
      }
    });

    return events.map(toWorkflowExecutionEventResponse);
  }

  async findExecutionNodes(workspaceId: string, workflowId: string, executionId: string) {
    await this.ensureExecutionExists(workspaceId, workflowId, executionId);

    const nodeExecutions = await this.prisma.workflowNodeExecution.findMany({
      where: {
        workspaceId,
        workflowId,
        executionId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return nodeExecutions.map(toWorkflowNodeExecutionResponse);
  }

  async findExecutionSummary(workspaceId: string, workflowId: string, executionId: string) {
    const execution = await this.findExecution(workspaceId, workflowId, executionId);

    const [nodeExecutions, events, aiTraces] = await Promise.all([
      this.prisma.workflowNodeExecution.findMany({
        where: {
          workspaceId,
          workflowId,
          executionId
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      this.prisma.workflowExecutionEvent.findMany({
        where: {
          workspaceId,
          workflowId,
          executionId
        },
        orderBy: {
          occurredAt: "asc"
        }
      }),
      this.prisma.workflowAiTrace.findMany({
        where: {
          workspaceId,
          workflowId,
          workflowExecutionId: executionId
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    ]);

    return {
      execution,
      nodes: nodeExecutions.map(toWorkflowNodeExecutionResponse),
      events: events.map(toWorkflowExecutionEventResponse),
      aiTraces: aiTraces.map(toWorkflowAiTraceResponse)
    };
  }

  async findExecutionDiagnostics(workspaceId: string, workflowId: string, executionId: string) {
    const execution = await this.findExecution(workspaceId, workflowId, executionId);

    const [events, outboxMessages] = await Promise.all([
      this.prisma.workflowExecutionEvent.findMany({
        where: {
          workspaceId,
          workflowId,
          executionId
        },
        orderBy: {
          occurredAt: "asc"
        }
      }),
      this.prisma.outboxMessage.findMany({
        where: {
          idempotencyKey: {
            contains: executionId
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    ]);

    const failedEvent = events.find((event) => event.eventName === FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed);
    const failure = getFailureFromExecutionDiagnostics(execution.error, failedEvent?.payload);
    const failedOutboxMessage = outboxMessages.find(
      (message) => message.eventName === FLOWPILOT_ROUTING_KEYS.workflowExecutionFailed
    );

    return {
      retry: {
        attempts: Math.max(0, failedOutboxMessage?.attempts ?? 0),
        deadLettered: execution.status === "FAILED" && Boolean(failure),
        lastFailureCode: failure?.code ?? null,
        lastFailureMessage: failure?.message ?? null,
        retryable: failure?.retryable ?? null
      },
      outbox: outboxMessages.map(toWorkflowExecutionOutboxDiagnosticsResponse)
    };
  }

  private getInitialDefinition(definition?: WorkflowDefinition): Prisma.InputJsonValue {
    return (definition ?? DEFAULT_WORKFLOW_DEFINITION) as Prisma.InputJsonObject;
  }

  private getExecutionInput(input?: Record<string, unknown>): Prisma.InputJsonValue {
    return (input ?? {}) as Prisma.InputJsonObject;
  }

  private async ensureWorkflowExists(workspaceId: string, workflowId: string): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        workspaceId
      },
      select: {
        id: true
      }
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
  }

  private async ensureExecutionExists(
    workspaceId: string,
    workflowId: string,
    executionId: string
  ): Promise<void> {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: {
        id: executionId,
        workspaceId,
        workflowId
      },
      select: {
        id: true
      }
    });

    if (!execution) {
      throw new NotFoundException("Workflow execution not found");
    }
  }
}

function createWorkflowCreatedMessage(
  workflow: ReturnType<typeof toWorkflowResponse>,
  actorUserId: string
): WorkflowCreatedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowCreated,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: new Date().toISOString(),
    workspaceId: workflow.workspaceId,
    correlationId: `workflow:${workflow.id}`,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    actor: {
      type: "user",
      id: actorUserId
    },
    idempotencyKey: `workflow.created:${workflow.id}`,
    payload: {
      workflowId: workflow.id,
      workflowVersionId: workflow.currentVersion.id,
      version: workflow.currentVersion.version,
      name: workflow.name,
      slug: workflow.slug,
      status: workflow.status
    }
  };
}

function createWorkflowExecutionRequestedMessage(
  execution: ReturnType<typeof toWorkflowExecutionResponse>,
  workflowVersion: number,
  actorUserId: string
): WorkflowExecutionRequestedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: new Date().toISOString(),
    workspaceId: execution.workspaceId,
    correlationId: `workflow-execution:${execution.id}`,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    actor: {
      type: "user",
      id: actorUserId
    },
    idempotencyKey: `workflow.execution.requested:${execution.id}`,
    payload: {
      workflowId: execution.workflowId,
      workflowVersion,
      executionId: execution.id,
      requestedBy: {
        type: "user",
        id: actorUserId
      },
      input: execution.input as Record<string, unknown>
    }
  };
}

const workflowWithCurrentVersion = {
  versions: {
    orderBy: {
      version: "desc"
    },
    take: 1
  }
} satisfies Prisma.WorkflowInclude;

type WorkflowWithCurrentVersion = Prisma.WorkflowGetPayload<{
  include: typeof workflowWithCurrentVersion;
}>;

type WorkflowVersion = Prisma.WorkflowVersionGetPayload<Record<string, never>>;
type WorkflowExecution = Prisma.WorkflowExecutionGetPayload<Record<string, never>>;
type WorkflowExecutionEvent = Prisma.WorkflowExecutionEventGetPayload<Record<string, never>>;
type WorkflowNodeExecution = Prisma.WorkflowNodeExecutionGetPayload<Record<string, never>>;
type OutboxMessage = Prisma.OutboxMessageGetPayload<Record<string, never>>;

function toWorkflowResponse(workflow: WorkflowWithCurrentVersion) {
  const currentVersion = workflow.versions[0];

  if (!currentVersion) {
    throw new NotFoundException("Workflow version not found");
  }

  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    slug: workflow.slug,
    description: workflow.description,
    status: workflow.status,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    currentVersion: {
      ...toWorkflowVersionResponse(currentVersion)
    }
  };
}

function toWorkflowVersionResponse(version: WorkflowVersion) {
  return {
    id: version.id,
    version: version.version,
    definition: version.definition,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  };
}

function toWorkflowExecutionResponse(execution: WorkflowExecution) {
  return {
    id: execution.id,
    workspaceId: execution.workspaceId,
    workflowId: execution.workflowId,
    workflowVersionId: execution.workflowVersionId,
    requestedByUserId: execution.requestedByUserId,
    status: execution.status,
    input: execution.input,
    output: execution.output,
    error: execution.error,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt
  };
}

function toWorkflowExecutionEventResponse(event: WorkflowExecutionEvent) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    workflowId: event.workflowId,
    executionId: event.executionId,
    eventName: event.eventName,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    producer: event.producer,
    payload: event.payload,
    createdAt: event.createdAt
  };
}

function toWorkflowNodeExecutionResponse(nodeExecution: WorkflowNodeExecution) {
  return {
    id: nodeExecution.id,
    workspaceId: nodeExecution.workspaceId,
    workflowId: nodeExecution.workflowId,
    executionId: nodeExecution.executionId,
    nodeId: nodeExecution.nodeId,
    nodeType: nodeExecution.nodeType,
    status: nodeExecution.status,
    input: nodeExecution.input,
    output: nodeExecution.output,
    error: nodeExecution.error,
    startedAt: nodeExecution.startedAt,
    completedAt: nodeExecution.completedAt,
    createdAt: nodeExecution.createdAt,
    updatedAt: nodeExecution.updatedAt
  };
}

function toWorkflowAiTraceResponse(trace: WorkflowAiTrace) {
  return {
    id: trace.id,
    workspaceId: trace.workspaceId,
    workflowId: trace.workflowId,
    workflowExecutionId: trace.workflowExecutionId,
    nodeExecutionId: trace.nodeExecutionId,
    nodeId: trace.nodeId,
    credentialId: trace.credentialId,
    provider: trace.provider,
    model: trace.model,
    status: trace.status,
    latencyMs: trace.latencyMs,
    providerLatencyMs: trace.providerLatencyMs,
    finishReason: trace.finishReason,
    inputTokenCount: trace.inputTokenCount,
    outputTokenCount: trace.outputTokenCount,
    totalTokenCount: trace.totalTokenCount,
    estimatedCostUsd: trace.estimatedCostUsd?.toString() ?? null,
    inputSizeBytes: trace.inputSizeBytes,
    outputSizeBytes: trace.outputSizeBytes,
    schemaValid: trace.schemaValid,
    errorCode: trace.errorCode,
    errorMessage: trace.errorMessage,
    providerStatusCode: trace.providerStatusCode,
    retryable: trace.retryable,
    createdAt: trace.createdAt
  };
}

function toWorkflowExecutionOutboxDiagnosticsResponse(message: OutboxMessage) {
  return {
    id: message.id,
    eventName: message.eventName,
    status: message.status,
    attempts: message.attempts,
    exchange: message.exchange,
    routingKey: message.routingKey,
    lastError: message.lastError,
    publishedAt: message.publishedAt,
    createdAt: message.createdAt
  };
}

function getFailureFromExecutionDiagnostics(executionError: unknown, failedEventPayload: unknown) {
  if (isFlowPilotFailure(executionError)) {
    return executionError;
  }

  if (isRecord(failedEventPayload) && isFlowPilotFailure(failedEventPayload.error)) {
    return failedEventPayload.error;
  }

  return null;
}

function isFlowPilotFailure(value: unknown): value is { code: string; message: string; retryable: boolean } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
