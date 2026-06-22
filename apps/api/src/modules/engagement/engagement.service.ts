import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import {
  CadenceEnrollmentStatus,
  CadencePhase,
  CommunicationChannel,
  ConsentPurpose,
  ConversationStatus,
  EventStatus,
  InterestSignalSource,
  MeetingStatus,
  MessageDirection,
  MessageEventType,
  MessageStatus,
  Prisma,
  PrivacyRequestStatus,
  PrivacyRequestType,
  PublicActionType,
  RegistrationStatus,
  ScheduledActionStatus
} from "@prisma/client/index";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { appConfig } from "../config/app.config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildPostEventSchedule } from "./cadence-schedule.js";
import { createCalendarProvider } from "./calendar-provider.js";
import { type BookMeetingDto } from "./dto/book-meeting.dto.js";
import { type EmailWebhookDto } from "./dto/email-webhook.dto.js";
import { type RecordInboundMessageDto } from "./dto/record-inbound-message.dto.js";
import { type RecordInterestDto } from "./dto/record-interest.dto.js";
import { type WithdrawConsentDto } from "./dto/withdraw-consent.dto.js";

const transitions: Record<RegistrationStatus, RegistrationStatus[]> = {
  REGISTERED: [RegistrationStatus.CONFIRMED, RegistrationStatus.DECLINED],
  WAITLISTED: [RegistrationStatus.REGISTERED, RegistrationStatus.DECLINED],
  CONFIRMED: [RegistrationStatus.ATTENDED, RegistrationStatus.NO_SHOW, RegistrationStatus.DECLINED],
  DECLINED: [], ATTENDED: [], NO_SHOW: []
};

@Injectable()
export class EngagementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngagementService.name);
  private retentionTimer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.retentionTimer = setInterval(() => void this.runRetentionAll().catch((error) => this.logger.error("Retention job failed", error instanceof Error ? error.stack : String(error))), 6 * 3_600_000);
    this.retentionTimer.unref();
  }

  onModuleDestroy() { if (this.retentionTimer) clearInterval(this.retentionTimer); }

  async dashboard(workspaceId: string, eventId?: string) {
    const where = { workspaceId, ...(eventId ? { eventId } : {}) };
    const [registrations, qualifications, deliveredMessages, bookedMeetings, total] = await Promise.all([
      this.prisma.registration.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.leadQualification.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.message.count({ where: { ...where, status: MessageStatus.DELIVERED } }),
      this.prisma.meeting.count({ where: { ...where, status: MeetingStatus.BOOKED } }),
      this.prisma.registration.count({ where })
    ]);
    const count = (status: RegistrationStatus) => registrations.find((item) => item.status === status)?._count._all ?? 0;
    const confirmed = count(RegistrationStatus.CONFIRMED) + count(RegistrationStatus.ATTENDED) + count(RegistrationStatus.NO_SHOW);
    const attended = count(RegistrationStatus.ATTENDED);
    return {
      registrations, qualifications, deliveredMessages, bookedMeetings, total,
      rates: {
        confirmation: ratio(confirmed, total),
        attendance: ratio(attended, confirmed),
        meeting: ratio(bookedMeetings, attended)
      },
      attendanceTarget: 0.7
    };
  }

  async updateRegistrationStatus(workspaceId: string, registrationId: string, status: RegistrationStatus) {
    const registration = await this.prisma.registration.findFirst({
      where: { id: registrationId, workspaceId }, include: { event: true }
    });
    if (!registration) throw new NotFoundException("Registration not found");
    if (!transitions[registration.status].includes(status)) throw new ConflictException(`Invalid registration transition: ${registration.status} -> ${status}`);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.registration.update({
        where: { id: registration.id },
        data: {
          status,
          confirmedAt: status === RegistrationStatus.CONFIRMED ? now : registration.confirmedAt,
          declinedAt: status === RegistrationStatus.DECLINED ? now : registration.declinedAt,
          attendedAt: status === RegistrationStatus.ATTENDED ? now : registration.attendedAt
        }
      });
      if (status === RegistrationStatus.DECLINED) await stopCadence(tx, registration.id, "registration_declined");
      if (status === RegistrationStatus.ATTENDED || status === RegistrationStatus.NO_SHOW) {
        await schedulePostEvent(tx, registration, status, registration.event.endsAt ?? now);
      }
      await tx.auditEvent.create({ data: { workspaceId, leadId: registration.leadId, actorType: "operator", action: "registration.status_changed", resource: "Registration", resourceId: registration.id, metadata: { from: registration.status, to: status } } });
      return updated;
    });
  }

  async recordInterest(workspaceId: string, dto: RecordInterestDto) {
    const registration = await this.prisma.registration.findFirst({ where: { id: dto.registrationId, workspaceId }, include: { lead: true, event: true } });
    if (!registration) throw new NotFoundException("Registration not found");
    return this.prisma.interestSignal.upsert({
      where: { registrationId_source_kind_value: { registrationId: registration.id, source: dto.source ?? InterestSignalSource.OBSERVED, kind: dto.kind.trim(), value: dto.value.trim() } },
      create: { workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id, source: dto.source ?? InterestSignalSource.OBSERVED, kind: dto.kind.trim(), value: dto.value.trim(), confidence: dto.confidence ?? 1, evidence: { source: "operator" } },
      update: { confidence: dto.confidence ?? 1, occurredAt: new Date() }
    });
  }

  async recordInbound(workspaceId: string, dto: RecordInboundMessageDto) {
    const registration = await this.prisma.registration.findFirst({ where: { id: dto.registrationId, workspaceId }, include: { lead: true } });
    if (!registration) throw new NotFoundException("Registration not found");
    if (dto.providerMessageId) {
      const duplicate = await this.prisma.message.findUnique({ where: { providerMessageId: dto.providerMessageId } });
      if (duplicate) return duplicate;
    }
    const normalized = dto.body.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isOptOut = /\b(stop|unsubscribe|cancelar|sair|nao quero|remover)\b/.test(normalized);
    const hasMeetingIntent = /\b(reuniao|meeting|conversar|agenda|horario)\b/.test(normalized);
    const needsHandoff = /\b(humano|pessoa|reclamacao|contrato|preco)\b/.test(normalized);
    const confirms = /\b(confirmo|confirmado|estarei|vou participar)\b/.test(normalized);
    const declines = /\b(nao poderei|nao vou|declino)\b/.test(normalized);
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { registrationId: registration.id },
        create: { workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id },
        update: { status: isOptOut ? ConversationStatus.SUPPRESSED : needsHandoff ? ConversationStatus.HANDOFF : hasMeetingIntent ? ConversationStatus.QUALIFIED : ConversationStatus.OPEN, lastMessageAt: new Date() }
      });
      const message = await tx.message.create({ data: { workspaceId, eventId: registration.eventId, leadId: registration.leadId, conversationId: conversation.id, direction: MessageDirection.INBOUND, channel: CommunicationChannel.EMAIL, purpose: ConsentPurpose.COMMERCIAL_FOLLOW_UP, status: MessageStatus.DELIVERED, body: dto.body.trim(), providerMessageId: dto.providerMessageId, deliveredAt: new Date() } });
      const intent = isOptOut ? "OPT_OUT" : needsHandoff ? "HANDOFF" : hasMeetingIntent ? "MEETING_INTENT" : confirms ? "CONFIRM" : declines ? "DECLINE" : "INBOUND_REPLY";
      await tx.interestSignal.create({ data: { workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id, source: InterestSignalSource.OBSERVED, kind: intent, value: dto.body.slice(0, 240), confidence: 1, evidence: { messageId: message.id } } });
      if (confirms && transitions[registration.status].includes(RegistrationStatus.CONFIRMED)) await tx.registration.update({ where: { id: registration.id }, data: { status: RegistrationStatus.CONFIRMED, confirmedAt: new Date() } });
      if (declines && transitions[registration.status].includes(RegistrationStatus.DECLINED)) await tx.registration.update({ where: { id: registration.id }, data: { status: RegistrationStatus.DECLINED, declinedAt: new Date() } });
      if (isOptOut) await suppressLead(tx, registration, ConsentPurpose.COMMERCIAL_FOLLOW_UP, "inbound_opt_out");
      if (isOptOut || needsHandoff || declines) await stopCadence(tx, registration.id, intent.toLowerCase());
      return message;
    });
  }

  async bookMeeting(workspaceId: string, dto: BookMeetingDto) {
    const startsAt = new Date(dto.startsAt); const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Meeting end must be after start");
    const registration = await this.prisma.registration.findFirst({ where: { id: dto.registrationId, workspaceId }, include: { lead: true, event: true } });
    if (!registration) throw new NotFoundException("Registration not found");
    const conflict = await this.prisma.meeting.findFirst({ where: { workspaceId, status: MeetingStatus.BOOKED, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (conflict) throw new ConflictException("Meeting slot is no longer available");
    const external = dto.providerMeetingId ? { provider: dto.provider ?? "external", providerMeetingId: dto.providerMeetingId, bookingUrl: dto.bookingUrl } : await createCalendarProvider().book({ title: `Vigil follow-up: ${registration.lead.companyName}`, startsAt, endsAt, timezone: dto.timezone, attendeeEmail: registration.lead.workEmail });
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({ data: { workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id, status: MeetingStatus.BOOKED, startsAt, endsAt, timezone: dto.timezone, provider: external.provider, providerMeetingId: external.providerMeetingId, bookingUrl: external.bookingUrl } });
      await stopCadence(tx, registration.id, "meeting_booked");
      await tx.auditEvent.create({ data: { workspaceId, leadId: registration.leadId, actorType: "operator", action: "meeting.booked", resource: "Meeting", resourceId: meeting.id } });
      return meeting;
    });
  }

  async consumePublicAction(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.publicActionToken.findUnique({ where: { tokenHash }, include: { registration: true } });
      if (!token || token.expiresAt <= new Date()) throw new NotFoundException("Action link is invalid or expired");
      if (token.consumedAt) return { action: token.action, status: token.registration.status, alreadyApplied: true };
      let status = token.registration.status;
      if (token.action === PublicActionType.CONFIRM && transitions[status].includes(RegistrationStatus.CONFIRMED)) status = RegistrationStatus.CONFIRMED;
      if (token.action === PublicActionType.DECLINE && transitions[status].includes(RegistrationStatus.DECLINED)) status = RegistrationStatus.DECLINED;
      if (status !== token.registration.status) await tx.registration.update({ where: { id: token.registrationId }, data: { status, confirmedAt: status === RegistrationStatus.CONFIRMED ? new Date() : undefined, declinedAt: status === RegistrationStatus.DECLINED ? new Date() : undefined } });
      if (token.action === PublicActionType.UNSUBSCRIBE) await suppressLead(tx, token.registration, token.purpose, "public_unsubscribe");
      if (token.action === PublicActionType.DECLINE || token.action === PublicActionType.UNSUBSCRIBE) await stopCadence(tx, token.registrationId, token.action.toLowerCase());
      await tx.publicActionToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
      return { action: token.action, status, alreadyApplied: false };
    });
  }

  async processEmailWebhook(dto: EmailWebhookDto, timestamp: string, signature: string) {
    verifyWebhook(dto, timestamp, signature);
    const message = await this.prisma.message.findUnique({ where: { providerMessageId: dto.providerMessageId } });
    if (!message) throw new NotFoundException("Message not found");
    const payloadHash = createHash("sha256").update(JSON.stringify(dto)).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.webhookReceipt.upsert({ where: { provider_providerEventId: { provider: "email", providerEventId: dto.eventId } }, create: { workspaceId: message.workspaceId, provider: "email", providerEventId: dto.eventId, eventType: dto.type, payloadHash }, update: {} });
      if (receipt.processedAt) return { duplicate: true };
      await tx.messageEvent.upsert({ where: { providerEventId: dto.eventId }, create: { messageId: message.id, type: dto.type, providerEventId: dto.eventId, occurredAt: new Date(dto.occurredAt), metadata: dto.metadata as Prisma.InputJsonObject | undefined }, update: {} });
      const status = dto.type === MessageEventType.BOUNCED || dto.type === MessageEventType.COMPLAINED ? MessageStatus.BOUNCED : dto.type === MessageEventType.DELIVERED ? MessageStatus.DELIVERED : message.status;
      await tx.message.update({ where: { id: message.id }, data: { status, deliveredAt: dto.type === MessageEventType.DELIVERED ? new Date(dto.occurredAt) : undefined, failedAt: status === MessageStatus.BOUNCED ? new Date(dto.occurredAt) : undefined, failureCode: status === MessageStatus.BOUNCED ? dto.type.toLowerCase() : undefined } });
      if (status === MessageStatus.BOUNCED) {
        await tx.suppression.upsert({ where: { workspaceId_leadId_purpose_channel: { workspaceId: message.workspaceId, leadId: message.leadId, purpose: message.purpose, channel: message.channel } }, create: { workspaceId: message.workspaceId, leadId: message.leadId, purpose: message.purpose, channel: message.channel, reason: dto.type.toLowerCase() }, update: { active: true, reason: dto.type.toLowerCase() } });
      }
      await tx.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: new Date() } });
      return { duplicate: false };
    });
  }

  async exportLead(workspaceId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: { registrations: true, consentRecords: true, enrichmentSnapshots: true, interestSignals: true, qualifications: true, conversations: { include: { messages: { include: { events: true } } } }, agentDecisions: true, meetings: true, suppressions: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    await this.prisma.privacyRequest.create({ data: { workspaceId, leadId, type: PrivacyRequestType.EXPORT, status: PrivacyRequestStatus.COMPLETED, completedAt: new Date() } });
    return { exportedAt: new Date().toISOString(), data: lead };
  }

  async withdrawConsent(workspaceId: string, leadId: string, dto: WithdrawConsentDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: { registrations: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    const purpose = dto.purpose ?? ConsentPurpose.COMMERCIAL_FOLLOW_UP;
    const channel = dto.channel ?? CommunicationChannel.EMAIL;
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.consentRecord.updateMany({ where: { workspaceId, leadId, purpose, channel, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawnReason: dto.reason ?? "data_subject_request" } });
      await tx.suppression.upsert({ where: { workspaceId_leadId_purpose_channel: { workspaceId, leadId, purpose, channel } }, create: { workspaceId, leadId, purpose, channel, reason: dto.reason ?? "data_subject_request" }, update: { active: true, reason: dto.reason ?? "data_subject_request" } });
      for (const registration of lead.registrations) await stopCadence(tx, registration.id, "consent_withdrawn");
      await tx.privacyRequest.create({ data: { workspaceId, leadId, type: PrivacyRequestType.WITHDRAW_CONSENT, completedAt: new Date(), metadata: { purpose, channel, affected: result.count } } });
      return { withdrawn: result.count };
    });
  }

  async deleteLeadData(workspaceId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw new NotFoundException("Lead not found");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.privacyRequest.create({ data: { workspaceId, leadId, type: PrivacyRequestType.DELETE, status: PrivacyRequestStatus.COMPLETED, completedAt: now, metadata: { mode: "anonymize", preservesAggregateMetrics: true } } });
      await tx.publicActionToken.deleteMany({ where: { leadId } });
      await tx.conversation.deleteMany({ where: { leadId } });
      await tx.interestSignal.deleteMany({ where: { leadId } });
      await tx.leadQualification.deleteMany({ where: { leadId } });
      await tx.enrichmentSnapshot.deleteMany({ where: { leadId } });
      await tx.consentRecord.deleteMany({ where: { leadId } });
      await tx.suppression.deleteMany({ where: { leadId } });
      await tx.agentDecision.deleteMany({ where: { leadId } });
      await tx.lead.update({ where: { id: leadId }, data: { fullName: "Deleted lead", workEmail: `deleted+${leadId}@privacy.invalid`, normalizedWorkEmail: `deleted+${leadId}@privacy.invalid`, jobTitle: null, companyName: "Deleted", companyDomain: null, suppressedAt: now } });
      await tx.auditEvent.create({ data: { workspaceId, leadId, actorType: "operator", action: "lead.anonymized", resource: "Lead", resourceId: leadId } });
      return { deleted: true, mode: "anonymized" };
    });
  }

  async runRetention(workspaceId: string, now = new Date()) {
    const events = await this.prisma.event.findMany({ where: { workspaceId, status: { in: [EventStatus.COMPLETED, EventStatus.CANCELLED] }, endsAt: { not: null } }, include: { registrations: { include: { lead: { include: { registrations: { include: { event: true } } } } } } } });
    const leadIds = new Set<string>();
    for (const event of events) {
      if (!event.endsAt || event.endsAt.getTime() + event.retentionDays * 86_400_000 > now.getTime()) continue;
      for (const registration of event.registrations) {
        const allExpired = registration.lead.registrations.every((item) => item.event.endsAt && (item.event.status === EventStatus.COMPLETED || item.event.status === EventStatus.CANCELLED) && item.event.endsAt.getTime() + item.event.retentionDays * 86_400_000 <= now.getTime());
        if (allExpired && !registration.lead.normalizedWorkEmail.endsWith("@privacy.invalid")) leadIds.add(registration.leadId);
      }
    }
    for (const leadId of leadIds) await this.deleteLeadData(workspaceId, leadId);
    return { anonymized: leadIds.size, evaluatedAt: now.toISOString() };
  }

  private async runRetentionAll() {
    const workspaces = await this.prisma.workspace.findMany({ select: { id: true } });
    for (const workspace of workspaces) await this.runRetention(workspace.id);
  }
}

type Tx = Prisma.TransactionClient;

async function stopCadence(tx: Tx, registrationId: string, reason: string) {
  const enrollment = await tx.cadenceEnrollment.findUnique({ where: { registrationId } });
  if (!enrollment) return;
  await tx.scheduledAction.updateMany({ where: { enrollmentId: enrollment.id, status: { in: [ScheduledActionStatus.PENDING, ScheduledActionStatus.DISPATCHING, ScheduledActionStatus.DISPATCHED] } }, data: { status: ScheduledActionStatus.CANCELLED, completedAt: new Date(), lastError: reason, leaseUntil: null } });
  await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { status: CadenceEnrollmentStatus.CANCELLED, nextActionAt: null } });
}

async function schedulePostEvent(tx: Tx, registration: { id: string; workspaceId: string; eventId: string; leadId: string }, status: RegistrationStatus, anchor: Date) {
  const enrollment = await tx.cadenceEnrollment.upsert({ where: { registrationId: registration.id }, create: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id, phase: CadencePhase.POST_EVENT }, update: { phase: CadencePhase.POST_EVENT, status: CadenceEnrollmentStatus.ACTIVE } });
  await tx.scheduledAction.updateMany({ where: { enrollmentId: enrollment.id, status: ScheduledActionStatus.PENDING }, data: { status: ScheduledActionStatus.CANCELLED, completedAt: new Date(), lastError: "post_event_transition" } });
  const steps = buildPostEventSchedule(status, anchor);
  for (const step of steps) await tx.scheduledAction.upsert({ where: { idempotencyKey: `cadence:${registration.id}:${step.key}` }, create: { workspaceId: registration.workspaceId, enrollmentId: enrollment.id, type: step.type, dueAt: step.dueAt, idempotencyKey: `cadence:${registration.id}:${step.key}`, payload: { registrationId: registration.id, action: step.key, purpose: step.purpose } }, update: {} });
  await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { nextActionAt: steps[0]?.dueAt ?? null } });
}

async function suppressLead(tx: Tx, registration: { workspaceId: string; eventId: string; leadId: string }, purpose: ConsentPurpose, reason: string) {
  await tx.suppression.upsert({ where: { workspaceId_leadId_purpose_channel: { workspaceId: registration.workspaceId, leadId: registration.leadId, purpose, channel: CommunicationChannel.EMAIL } }, create: { workspaceId: registration.workspaceId, leadId: registration.leadId, purpose, channel: CommunicationChannel.EMAIL, reason }, update: { active: true, reason } });
  await tx.consentRecord.updateMany({ where: { eventId: registration.eventId, leadId: registration.leadId, purpose, channel: CommunicationChannel.EMAIL, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawnReason: reason } });
}

function verifyWebhook(dto: EmailWebhookDto, timestamp: string, signature: string) {
  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp * 1_000) > 300_000) throw new UnauthorizedException("Webhook timestamp is invalid");
  const expected = createHmac("sha256", appConfig.webhookSigningSecret).update(`${timestamp}.${JSON.stringify(dto)}`).digest("hex");
  const supplied = signature.replace(/^sha256=/, "");
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException("Webhook signature is invalid");
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}
