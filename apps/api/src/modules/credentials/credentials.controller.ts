import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";

import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { WorkspaceRoles } from "../auth/decorators/workspace-roles.decorator.js";
import { InternalApiGuard } from "../auth/guards/internal-api.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "../auth/guards/workspace-roles.guard.js";
import type { AuthenticatedUser } from "../auth/types/current-user.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CredentialResponseDto } from "./dto/credential-response.dto.js";
import {
  CreateCredentialDto,
  CreateCredentialSwaggerDto,
  createCredentialSchema
} from "./dto/create-credential.dto.js";
import { CredentialsService } from "./credentials.service.js";

@ApiTags("credentials")
@Controller("workspaces/:workspaceId/credentials")
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
@ApiBearerAuth()
export class CredentialsController {
  constructor(@Inject(CredentialsService) private readonly credentialsService: CredentialsService) {}

  @Get()
  @WorkspaceRoles(
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  )
  @ApiOkResponse({
    description: "Workspace integration credential list without secret values.",
    type: CredentialResponseDto,
    isArray: true
  })
  findAll(@Param("workspaceId") workspaceId: string) {
    return this.credentialsService.findAllForWorkspace(workspaceId);
  }

  @Post()
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiCreatedResponse({
    description: "Integration credential created with encrypted secret value.",
    type: CredentialResponseDto
  })
  @ApiBody({ type: CreateCredentialSwaggerDto })
  create(
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCredentialSchema)) dto: CreateCredentialDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.credentialsService.create(workspaceId, user.sub, dto);
  }

  @Delete(":credentialId")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOkResponse({
    description: "Integration credential removed."
  })
  remove(
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string
  ) {
    return this.credentialsService.remove(workspaceId, credentialId);
  }
}

@ApiTags("internal")
@Controller("internal/workspaces/:workspaceId/credentials")
@UseGuards(InternalApiGuard)
export class InternalCredentialsController {
  constructor(@Inject(CredentialsService) private readonly credentialsService: CredentialsService) {}

  @Get(":credentialId/secret")
  @ApiOkResponse({
    description: "Internal credential secret lookup for service-to-service AI provider execution."
  })
  findSecret(
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string
  ) {
    return this.credentialsService.findSecret(workspaceId, credentialId);
  }
}
