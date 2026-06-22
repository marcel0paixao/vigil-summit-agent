import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";
import { WorkspaceRoles } from "../auth/decorators/workspace-roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "../auth/guards/workspace-roles.guard.js";
import { BookMeetingDto } from "./dto/book-meeting.dto.js";
import { RecordInboundMessageDto } from "./dto/record-inbound-message.dto.js";
import { EmailWebhookDto } from "./dto/email-webhook.dto.js";
import { RecordInterestDto } from "./dto/record-interest.dto.js";
import { UpdateRegistrationStatusDto } from "./dto/update-registration-status.dto.js";
import { WithdrawConsentDto } from "./dto/withdraw-consent.dto.js";
import { EngagementService } from "./engagement.service.js";

const readers = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER, WorkspaceRole.VIEWER] as const;

@ApiTags("engagement")
@ApiBearerAuth()
@Controller("workspaces/:workspaceId/engagement")
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
export class EngagementController {
  constructor(@Inject(EngagementService) private readonly service: EngagementService) {}

  @Get("dashboard") @WorkspaceRoles(...readers)
  dashboard(@Param("workspaceId") workspaceId: string, @Query("eventId") eventId?: string) { return this.service.dashboard(workspaceId, eventId); }

  @Patch("registrations/:registrationId/status")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  updateStatus(@Param("workspaceId") workspaceId: string, @Param("registrationId") registrationId: string, @Body() dto: UpdateRegistrationStatusDto) {
    return this.service.updateRegistrationStatus(workspaceId, registrationId, dto.status);
  }

  @Post("messages/inbound")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  inbound(@Param("workspaceId") workspaceId: string, @Body() dto: RecordInboundMessageDto) {
    return this.service.recordInbound(workspaceId, dto);
  }

  @Post("interests")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  interest(@Param("workspaceId") workspaceId: string, @Body() dto: RecordInterestDto) {
    return this.service.recordInterest(workspaceId, dto);
  }

  @Post("meetings")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  meeting(@Param("workspaceId") workspaceId: string, @Body() dto: BookMeetingDto) {
    return this.service.bookMeeting(workspaceId, dto);
  }

  @Get("privacy/leads/:leadId/export")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  exportLead(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.service.exportLead(workspaceId, leadId);
  }

  @Post("privacy/leads/:leadId/withdraw-consent")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  withdrawConsent(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string, @Body() dto: WithdrawConsentDto) {
    return this.service.withdrawConsent(workspaceId, leadId, dto);
  }

  @Delete("privacy/leads/:leadId")
  @WorkspaceRoles(WorkspaceRole.OWNER)
  deleteLead(@Param("workspaceId") workspaceId: string, @Param("leadId") leadId: string) {
    return this.service.deleteLeadData(workspaceId, leadId);
  }

  @Post("privacy/retention/run")
  @WorkspaceRoles(WorkspaceRole.OWNER)
  retention(@Param("workspaceId") workspaceId: string) {
    return this.service.runRetention(workspaceId);
  }
}

@ApiTags("public-engagement")
@Controller("public/engagement")
export class PublicEngagementController {
  constructor(@Inject(EngagementService) private readonly service: EngagementService) {}

  @Post("actions/:token")
  action(@Param("token") token: string) { return this.service.consumePublicAction(token); }

  @Post("webhooks/email")
  webhook(
    @Body() dto: EmailWebhookDto,
    @Req() request: { rawBody?: Buffer },
    @Headers("svix-id") id: string,
    @Headers("svix-timestamp") timestamp: string,
    @Headers("svix-signature") signature: string
  ) {
    return this.service.processEmailWebhook(dto, request.rawBody, { id, timestamp, signature });
  }
}
