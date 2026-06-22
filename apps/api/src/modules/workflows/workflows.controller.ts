import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";

import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { WorkspaceRoles } from "../auth/decorators/workspace-roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "../auth/guards/workspace-roles.guard.js";
import type { AuthenticatedUser } from "../auth/types/current-user.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import {
  CreateWorkflowExecutionDto,
  createWorkflowExecutionSchema
} from "./dto/create-workflow-execution.dto.js";
import { CreateWorkflowDto, createWorkflowSchema } from "./dto/create-workflow.dto.js";
import {
  CreateWorkflowVersionDto,
  createWorkflowVersionSchema
} from "./dto/create-workflow-version.dto.js";
import { UpdateWorkflowDto, updateWorkflowSchema } from "./dto/update-workflow.dto.js";
import { WorkflowExecutionEventResponseDto } from "./dto/workflow-execution-event-response.dto.js";
import { WorkflowExecutionDiagnosticsResponseDto } from "./dto/workflow-execution-diagnostics-response.dto.js";
import { WorkflowExecutionResponseDto } from "./dto/workflow-execution-response.dto.js";
import { WorkflowExecutionSummaryResponseDto } from "./dto/workflow-execution-summary-response.dto.js";
import { WorkflowNodeExecutionResponseDto } from "./dto/workflow-node-execution-response.dto.js";
import { WorkflowResponseDto, WorkflowVersionResponseDto } from "./dto/workflow-response.dto.js";
import { WorkflowsService } from "./workflows.service.js";

@ApiTags("workflows")
@Controller("workspaces/:workspaceId/workflows")
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
@ApiBearerAuth()
export class WorkflowsController {
  constructor(@Inject(WorkflowsService) private readonly workflowsService: WorkflowsService) {}

  @Post()
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiCreatedResponse({
    description: "Workflow created with an initial draft version.",
    type: WorkflowResponseDto
  })
  create(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createWorkflowSchema)) dto: CreateWorkflowDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.workflowsService.create(workspaceId, dto, user.sub);
  }

  @Get()
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workspace workflow list.",
    type: WorkflowResponseDto,
    isArray: true
  })
  findAll(@Param("workspaceId") workspaceId: string) {
    return this.workflowsService.findAllForWorkspace(workspaceId);
  }

  @Get(":workflowId/versions")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow version history.",
    type: WorkflowVersionResponseDto,
    isArray: true
  })
  findVersions(@Param("workspaceId") workspaceId: string, @Param("workflowId") workflowId: string) {
    return this.workflowsService.findVersions(workspaceId, workflowId);
  }

  @Post(":workflowId/versions/:versionId/restore")
  @HttpCode(201)
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiCreatedResponse({
    description: "Workflow version restored by creating a new immutable version from it.",
    type: WorkflowResponseDto
  })
  restoreVersion(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("versionId") versionId: string
  ) {
    return this.workflowsService.restoreVersion(workspaceId, workflowId, versionId);
  }

  @Get(":workflowId")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow details.",
    type: WorkflowResponseDto
  })
  findOne(@Param("workspaceId") workspaceId: string, @Param("workflowId") workflowId: string) {
    return this.workflowsService.findOne(workspaceId, workflowId);
  }

  @Patch(":workflowId")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiOkResponse({
    description: "Workflow metadata updated without changing the current immutable version.",
    type: WorkflowResponseDto
  })
  updateMetadata(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) dto: UpdateWorkflowDto
  ) {
    return this.workflowsService.updateMetadata(workspaceId, workflowId, dto);
  }

  @Post(":workflowId/versions")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiCreatedResponse({
    description: "Workflow definition saved as a new immutable version.",
    type: WorkflowResponseDto
  })
  createVersion(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowVersionSchema)) dto: CreateWorkflowVersionDto
  ) {
    return this.workflowsService.createVersion(workspaceId, workflowId, dto);
  }

  @Get(":workflowId/executions")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution list.",
    type: WorkflowExecutionResponseDto,
    isArray: true
  })
  findExecutions(@Param("workspaceId") workspaceId: string, @Param("workflowId") workflowId: string) {
    return this.workflowsService.findExecutions(workspaceId, workflowId);
  }

  @Get(":workflowId/executions/:executionId/events")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution timeline events.",
    type: WorkflowExecutionEventResponseDto,
    isArray: true
  })
  findExecutionEvents(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("executionId") executionId: string
  ) {
    return this.workflowsService.findExecutionEvents(workspaceId, workflowId, executionId);
  }

  @Get(":workflowId/executions/:executionId/nodes")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution node progress.",
    type: WorkflowNodeExecutionResponseDto,
    isArray: true
  })
  findExecutionNodes(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("executionId") executionId: string
  ) {
    return this.workflowsService.findExecutionNodes(workspaceId, workflowId, executionId);
  }

  @Get(":workflowId/executions/:executionId/summary")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution summary for front-end detail views.",
    type: WorkflowExecutionSummaryResponseDto
  })
  findExecutionSummary(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("executionId") executionId: string
  ) {
    return this.workflowsService.findExecutionSummary(workspaceId, workflowId, executionId);
  }

  @Get(":workflowId/executions/:executionId/diagnostics")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution retry and outbox diagnostics.",
    type: WorkflowExecutionDiagnosticsResponseDto
  })
  findExecutionDiagnostics(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("executionId") executionId: string
  ) {
    return this.workflowsService.findExecutionDiagnostics(workspaceId, workflowId, executionId);
  }

  @Get(":workflowId/executions/:executionId")
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workflow execution details.",
    type: WorkflowExecutionResponseDto
  })
  findExecution(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Param("executionId") executionId: string
  ) {
    return this.workflowsService.findExecution(workspaceId, workflowId, executionId);
  }

  @Post(":workflowId/executions")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiCreatedResponse({
    description: "Workflow execution requested and queued for asynchronous processing.",
    type: WorkflowExecutionResponseDto
  })
  requestExecution(
    @Param("workspaceId") workspaceId: string,
    @Param("workflowId") workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowExecutionSchema)) dto: CreateWorkflowExecutionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.workflowsService.requestExecution(workspaceId, workflowId, dto, user.sub);
  }
}
