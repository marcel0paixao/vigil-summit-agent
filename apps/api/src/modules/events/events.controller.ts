import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";
import { type FastifyRequest } from "fastify";
import { EventStatus } from "@prisma/client/index";

import { WorkspaceRoles } from "../auth/decorators/workspace-roles.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "../auth/guards/workspace-roles.guard.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import { EventRegistrationResponseDto, EventResponseDto } from "./dto/event-response.dto.js";
import { RegisterForEventDto } from "./dto/register-for-event.dto.js";
import { UpdateEventDto } from "./dto/update-event.dto.js";
import { EventsService } from "./events.service.js";
import { PublicRegistrationProtectionService } from "./public-registration-protection.service.js";

const eventReaderRoles = [
  WorkspaceRole.OWNER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.MEMBER,
  WorkspaceRole.VIEWER
] as const;

@ApiTags("events")
@ApiBearerAuth()
@Controller("workspaces/:workspaceId/events")
@UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly eventsService: EventsService) {}

  @Post()
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER)
  @ApiCreatedResponse({ type: EventResponseDto })
  create(@Param("workspaceId") workspaceId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(workspaceId, dto);
  }

  @Get()
  @WorkspaceRoles(...eventReaderRoles)
  @ApiOkResponse({ type: EventResponseDto, isArray: true })
  findAll(@Param("workspaceId") workspaceId: string) {
    return this.eventsService.findAll(workspaceId);
  }

  @Patch(":eventId")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  update(@Param("workspaceId") workspaceId: string, @Param("eventId") eventId: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(workspaceId, eventId, dto);
  }

  @Patch(":eventId/publish")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOkResponse({ type: EventResponseDto })
  publish(
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string
  ) {
    return this.eventsService.publish(workspaceId, eventId);
  }

  @Patch(":eventId/start")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  start(@Param("workspaceId") workspaceId: string, @Param("eventId") eventId: string) {
    return this.eventsService.transition(workspaceId, eventId, EventStatus.LIVE);
  }

  @Patch(":eventId/complete")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  complete(@Param("workspaceId") workspaceId: string, @Param("eventId") eventId: string) {
    return this.eventsService.transition(workspaceId, eventId, EventStatus.COMPLETED);
  }

  @Patch(":eventId/cancel")
  @WorkspaceRoles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  cancel(@Param("workspaceId") workspaceId: string, @Param("eventId") eventId: string) {
    return this.eventsService.transition(workspaceId, eventId, EventStatus.CANCELLED);
  }
}

@ApiTags("public-events")
@Controller("public/events")
export class PublicEventsController {
  constructor(
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(PublicRegistrationProtectionService)
    private readonly protection: PublicRegistrationProtectionService
  ) {}

  @Get(":eventId")
  @ApiOkResponse({ type: EventResponseDto })
  findPublicEvent(@Param("eventId") eventId: string) {
    return this.eventsService.findPublicEvent(eventId);
  }

  @Post(":eventId/registrations")
  @ApiCreatedResponse({ type: EventRegistrationResponseDto })
  async register(
    @Param("eventId") eventId: string,
    @Body() dto: RegisterForEventDto,
    @Req() request: FastifyRequest
  ) {
    const protection = await this.protection.check(eventId, request.ip, dto.website);
    if (protection.blockedAsBot) return protection.response;
    return this.eventsService.register(eventId, dto);
  }
}
