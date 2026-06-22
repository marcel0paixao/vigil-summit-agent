import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CommunicationChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  EventStatus,
  LeadSource,
  Prisma,
  RegistrationStatus
} from "@prisma/client/index";
import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import { randomUUID } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service.js";
import { CreateEventDto } from "./dto/create-event.dto.js";
import { RegisterForEventDto } from "./dto/register-for-event.dto.js";
import { UpdateEventDto } from "./dto/update-event.dto.js";

const activeCapacityStatuses = [
  RegistrationStatus.REGISTERED,
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.ATTENDED
] as const;

@Injectable()
export class EventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateEventDto) {
    this.assertValidSchedule(dto);

    try {
      return await this.prisma.event.create({
        data: {
          workspaceId,
          name: dto.name.trim(),
          slug: dto.slug,
          description: dto.description?.trim(),
          location: dto.location?.trim(),
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          timezone: dto.timezone,
          capacity: dto.capacity,
          ...(dto.audienceProfile
            ? { audienceProfile: dto.audienceProfile as Prisma.InputJsonObject }
            : {})
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Event slug already exists in this workspace");
      }

      throw error;
    }
  }

  findAll(workspaceId: string) {
    return this.prisma.event.findMany({
      where: { workspaceId },
      orderBy: { startsAt: "asc" }
    });
  }

  async update(workspaceId: string, eventId: string, dto: UpdateEventDto) {
    const current = await this.prisma.event.findFirst({ where: { id: eventId, workspaceId } });
    if (!current) throw new NotFoundException("Event not found");
    if (current.status === EventStatus.COMPLETED || current.status === EventStatus.CANCELLED) {
      throw new ConflictException("Terminal events cannot be edited");
    }
    const schedule = {
      startsAt: dto.startsAt ?? current.startsAt.toISOString(),
      endsAt: dto.endsAt ?? current.endsAt?.toISOString(),
      timezone: dto.timezone ?? current.timezone
    };
    this.assertValidSchedule({ ...dto, ...schedule } as CreateEventDto);
    if (dto.maxCompanions !== undefined && dto.companionEnabled === false && dto.maxCompanions > 0) {
      throw new BadRequestException("Companion limit requires companion support");
    }
    return this.prisma.event.update({
      where: { id: current.id },
      data: {
        ...dto,
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        location: dto.location?.trim(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        audienceProfile: dto.audienceProfile as Prisma.InputJsonObject | undefined,
        agenda: dto.agenda as Prisma.InputJsonObject | undefined
      }
    });
  }

  async publish(workspaceId: string, eventId: string) {
    const result = await this.prisma.event.updateMany({
      where: {
        id: eventId,
        workspaceId,
        status: EventStatus.DRAFT
      },
      data: { status: EventStatus.PUBLISHED }
    });

    if (result.count === 0) {
      throw new NotFoundException("Draft event not found");
    }

    return this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  }

  async transition(workspaceId: string, eventId: string, target: EventStatus) {
    const allowed: Partial<Record<EventStatus, EventStatus[]>> = {
      [EventStatus.PUBLISHED]: [EventStatus.LIVE, EventStatus.CANCELLED],
      [EventStatus.LIVE]: [EventStatus.COMPLETED, EventStatus.CANCELLED]
    };
    const event = await this.prisma.event.findFirst({ where: { id: eventId, workspaceId } });
    if (!event) throw new NotFoundException("Event not found");
    if (!(allowed[event.status] ?? []).includes(target)) {
      throw new ConflictException(`Invalid event transition: ${event.status} -> ${target}`);
    }
    return this.prisma.event.update({ where: { id: event.id }, data: { status: target } });
  }

  async findPublicEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        status: { in: [EventStatus.PUBLISHED, EventStatus.LIVE] }
      },
      select: publicEventSelect
    });

    if (!event) {
      throw new NotFoundException("Published event not found");
    }

    return event;
  }

  async register(eventId: string, dto: RegisterForEventDto) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (transaction) => this.registerInTransaction(transaction, eventId, dto),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (this.isRetryableTransactionConflict(error) && attempt < 3) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException("Registration could not be completed");
  }

  private async registerInTransaction(
    transaction: Prisma.TransactionClient,
    eventId: string,
    dto: RegisterForEventDto
  ) {
    const event = await transaction.event.findFirst({
      where: {
        id: eventId,
        status: { in: [EventStatus.PUBLISHED, EventStatus.LIVE] }
      }
    });

    if (!event) {
      throw new NotFoundException("Published event not found");
    }

    const normalizedWorkEmail = dto.workEmail.trim().toLowerCase();
    const existingLead = await transaction.lead.findUnique({
      where: {
        workspaceId_normalizedWorkEmail: {
          workspaceId: event.workspaceId,
          normalizedWorkEmail
        }
      }
    });

    if (existingLead) {
      const existingRegistration = await transaction.registration.findUnique({
        where: {
          eventId_leadId: {
            eventId,
            leadId: existingLead.id
          }
        }
      });

      if (existingRegistration) {
        return this.toRegistrationResponse(existingRegistration, existingLead.id, false);
      }
    }

    const occupiedSeats = await transaction.registration.count({
      where: {
        eventId,
        status: { in: [...activeCapacityStatuses] }
      }
    });
    const registrationStatus =
      occupiedSeats >= event.capacity
        ? RegistrationStatus.WAITLISTED
        : RegistrationStatus.REGISTERED;
    const lead = await transaction.lead.upsert({
      where: {
        workspaceId_normalizedWorkEmail: {
          workspaceId: event.workspaceId,
          normalizedWorkEmail
        }
      },
      create: {
        workspaceId: event.workspaceId,
        fullName: dto.fullName.trim(),
        workEmail: dto.workEmail.trim(),
        normalizedWorkEmail,
        jobTitle: dto.jobTitle?.trim(),
        companyName: dto.companyName.trim(),
        companyDomain: dto.companyDomain?.trim().toLowerCase(),
        source: LeadSource.REGISTRATION_FORM
      },
      update: {
        fullName: dto.fullName.trim(),
        workEmail: dto.workEmail.trim(),
        jobTitle: dto.jobTitle?.trim(),
        companyName: dto.companyName.trim(),
        companyDomain: dto.companyDomain?.trim().toLowerCase()
      }
    });
    const registration = await transaction.registration.create({
      data: {
        workspaceId: event.workspaceId,
        eventId,
        leadId: lead.id,
        status: registrationStatus,
        interestTopics: dto.interestTopics?.map((topic) => topic.trim()) ?? []
      }
    });
    const purposes = [
      ConsentPurpose.EVENT_COMMUNICATION,
      ...(dto.commercialFollowUpConsent ? [ConsentPurpose.COMMERCIAL_FOLLOW_UP] : [])
    ];

    await transaction.consentRecord.createMany({
      data: purposes.map((purpose) => ({
        workspaceId: event.workspaceId,
        eventId,
        leadId: lead.id,
        purpose,
        legalBasis: ConsentLegalBasis.CONSENT,
        channel: CommunicationChannel.EMAIL,
        noticeVersion: dto.privacyNoticeVersion,
        source: "public_registration_form"
      }))
    });

    const enrichmentMessage = this.createEnrichmentMessage(
      event.workspaceId,
      event.id,
      lead.id,
      registration.id
    );

    await transaction.outboxMessage.create({
      data: {
        exchange: FLOWPILOT_EXCHANGES.commands,
        routingKey: enrichmentMessage.eventName,
        eventName: enrichmentMessage.eventName,
        messageId: enrichmentMessage.eventId,
        idempotencyKey: enrichmentMessage.idempotencyKey ?? enrichmentMessage.eventId,
        payload: enrichmentMessage as unknown as Prisma.InputJsonObject,
        headers: {
          correlationId: enrichmentMessage.correlationId,
          producer: enrichmentMessage.producer,
          schemaVersion: enrichmentMessage.schemaVersion,
          workspaceId: enrichmentMessage.workspaceId
        }
      }
    });

    return this.toRegistrationResponse(registration, lead.id, true);
  }

  private createEnrichmentMessage(
    workspaceId: string,
    eventId: string,
    leadId: string,
    registrationId: string
  ): LeadEnrichmentRequestedMessage {
    return {
      eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
      eventId: randomUUID(),
      schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      workspaceId,
      correlationId: `registration:${registrationId}`,
      producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
      actor: {
        type: "webhook",
        id: "public-registration"
      },
      idempotencyKey: `lead.enrichment.requested:${registrationId}`,
      payload: {
        eventId,
        leadId,
        registrationId
      }
    };
  }

  private toRegistrationResponse(
    registration: { id: string; status: RegistrationStatus },
    leadId: string,
    created: boolean
  ) {
    return {
      created,
      registrationId: registration.id,
      leadId,
      status: registration.status
    };
  }

  private assertValidSchedule(dto: CreateEventDto): void {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException("Event timezone is invalid");
    }

    if (dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException("Event end must be after its start");
    }
  }

  private isRetryableTransactionConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
  }
}

const publicEventSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  location: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  capacity: true,
  status: true
} satisfies Prisma.EventSelect;
