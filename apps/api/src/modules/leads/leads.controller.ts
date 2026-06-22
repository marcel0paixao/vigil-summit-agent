import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";

import { WorkspaceRoles } from "../auth/decorators/workspace-roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "../auth/guards/workspace-roles.guard.js";
import { LeadsService } from "./leads.service.js";

const readerRoles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER] as const;

@ApiTags("leads")
@ApiBearerAuth()
@Controller("workspaces/:workspaceId/leads")
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leadsService: LeadsService) {}

  @Get()
  @WorkspaceRoles(...readerRoles)
  @ApiOkResponse({ description: "Workspace leads with registration and qualification summary." })
  findAll(@Param("workspaceId") workspaceId: string, @Query("eventId") eventId?: string) {
    return this.leadsService.findAll(workspaceId, eventId);
  }

  @Get(":leadId")
  @WorkspaceRoles(...readerRoles)
  @ApiOkResponse({ description: "Lead profile with provenance and qualification history." })
  findOne(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.leadsService.findOne(workspaceId, leadId);
  }
}
