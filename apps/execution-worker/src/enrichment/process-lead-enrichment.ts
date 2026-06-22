import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentCompletedMessage,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import {
  CadencePhase,
  ConsentPurpose,
  EnrichmentStatus,
  InterestSignalSource,
  Prisma,
  ScheduledActionType,
  type PrismaClient
} from "@prisma/client/index";
import { randomUUID } from "node:crypto";

import { type EnrichmentProvider } from "./enrichment-provider.js";
import { qualifyLead } from "../qualification/qualification-policy.js";

export class LeadEnrichmentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LeadEnrichmentError";
  }
}

export async function processLeadEnrichment(
  message: LeadEnrichmentRequestedMessage,
  prisma: PrismaClient,
  provider: EnrichmentProvider
) {
  const { eventId, leadId, registrationId } = message.payload;
  const registration = await prisma.registration.findFirst({
    where: {
      id: registrationId,
      workspaceId: message.workspaceId,
      eventId,
      leadId
    },
    include: {
      lead: true,
      event: { select: { audienceProfile: true, startsAt: true } }
    }
  });

  if (!registration) {
    throw new LeadEnrichmentError(
      "lead_enrichment_context_not_found",
      "Registration and lead context do not match the enrichment command",
      false
    );
  }

  const existingSnapshot = await prisma.enrichmentSnapshot.findUnique({
    where: { registrationId }
  });

  if (existingSnapshot?.status === EnrichmentStatus.SUCCEEDED) {
    return existingSnapshot;
  }

  const startedAt = new Date();
  const snapshot = await prisma.enrichmentSnapshot.upsert({
    where: { registrationId },
    create: {
      workspaceId: message.workspaceId,
      eventId,
      leadId,
      registrationId,
      provider: provider.name,
      providerVersion: provider.version,
      status: EnrichmentStatus.PENDING,
      startedAt
    },
    update: {
      provider: provider.name,
      providerVersion: provider.version,
      status: EnrichmentStatus.PENDING,
      errorCode: null,
      errorMessage: null,
      startedAt,
      completedAt: null
    }
  });

  try {
    const result = await provider.enrich({
      fullName: registration.lead.fullName,
      workEmail: registration.lead.workEmail,
      jobTitle: registration.lead.jobTitle,
      companyName: registration.lead.companyName,
      companyDomain: registration.lead.companyDomain,
      interestTopics: registration.interestTopics
    });
    const completedAt = new Date();
    const completedMessage = createCompletedMessage(message, snapshot.id, result);

    return await prisma.$transaction(async (transaction) => {
      const completedSnapshot = await transaction.enrichmentSnapshot.update({
        where: { id: snapshot.id },
        data: {
          provider: result.provider,
          providerVersion: result.providerVersion,
          status: EnrichmentStatus.SUCCEEDED,
          jobTitle: result.jobTitle,
          seniority: result.seniority,
          roleCategory: result.roleCategory,
          companyName: result.companyName,
          companyDomain: result.companyDomain,
          companyIndustry: result.companyIndustry,
          companyEmployeeRange: result.companyEmployeeRange,
          professionalProfileUrl: result.professionalProfileUrl,
          securitySignals: result.securitySignals,
          confidence: result.confidence,
          evidence: result.evidence as unknown as Prisma.InputJsonArray,
          providerPayload: result.providerPayload as Prisma.InputJsonObject,
          completedAt
        }
      });
      const qualification = qualifyLead({
        jobTitle: result.jobTitle,
        seniority: result.seniority,
        roleCategory: result.roleCategory,
        companyIndustry: result.companyIndustry,
        companyEmployeeRange: result.companyEmployeeRange,
        securitySignals: result.securitySignals,
        audienceProfile: isRecord(registration.event.audienceProfile)
          ? registration.event.audienceProfile
          : null
      });

      const qualificationRecord = await transaction.leadQualification.upsert({
        where: { registrationId },
        create: {
          workspaceId: message.workspaceId,
          eventId,
          leadId,
          registrationId,
          snapshotId: snapshot.id,
          ...qualification
        },
        update: {
          snapshotId: snapshot.id,
          ...qualification,
          evaluatedAt: completedAt
        }
      });

      const communicationConsent = await transaction.consentRecord.findFirst({
        where: {
          eventId,
          leadId,
          purpose: ConsentPurpose.EVENT_COMMUNICATION,
          withdrawnAt: null
        },
        select: { id: true }
      });

      if (communicationConsent && qualification.status !== "DISQUALIFIED") {
        await transaction.conversation.upsert({
          where: { registrationId },
          create: { workspaceId: message.workspaceId, eventId, leadId, registrationId },
          update: {}
        });
        const enrollment = await transaction.cadenceEnrollment.upsert({
          where: { registrationId },
          create: {
            workspaceId: message.workspaceId,
            eventId,
            leadId,
            registrationId,
            phase: CadencePhase.PRE_EVENT,
            nextActionAt: completedAt
          },
          update: { nextActionAt: completedAt }
        });
        const schedule = buildPreEventSchedule(registration.event.startsAt, completedAt);
        for (const step of schedule) {
          await transaction.scheduledAction.upsert({
            where: { idempotencyKey: `cadence:${registrationId}:${step.key}` },
            create: {
              workspaceId: message.workspaceId,
              enrollmentId: enrollment.id,
              type: step.type,
              dueAt: step.dueAt,
              idempotencyKey: `cadence:${registrationId}:${step.key}`,
              payload: {
                action: step.key,
                purpose: ConsentPurpose.EVENT_COMMUNICATION,
                eventId,
                leadId,
                registrationId,
                qualificationId: qualificationRecord.id
              }
            },
            update: {}
          });
        }
      }

      await transaction.interestSignal.createMany({
        data: [
          ...registration.interestTopics.map((topic) => ({
            workspaceId: message.workspaceId,
            eventId,
            leadId,
            registrationId,
            enrichmentSnapshotId: snapshot.id,
            source: InterestSignalSource.DECLARED,
            kind: "TOPIC",
            value: topic,
            confidence: 1,
            evidence: { source: "public_registration_form" }
          })),
          ...result.securitySignals.map((signal) => ({
            workspaceId: message.workspaceId,
            eventId,
            leadId,
            registrationId,
            enrichmentSnapshotId: snapshot.id,
            source: InterestSignalSource.ENRICHED,
            kind: "SECURITY_INTEREST",
            value: signal,
            confidence: result.confidence,
            evidence: { provider: result.provider }
          }))
        ],
        skipDuplicates: true
      });

      await transaction.outboxMessage.upsert({
        where: { idempotencyKey: completedMessage.idempotencyKey },
        update: {},
        create: {
          exchange: FLOWPILOT_EXCHANGES.events,
          routingKey: completedMessage.eventName,
          eventName: completedMessage.eventName,
          messageId: completedMessage.eventId,
          idempotencyKey: completedMessage.idempotencyKey,
          payload: completedMessage as unknown as Prisma.InputJsonObject,
          headers: {
            correlationId: completedMessage.correlationId,
            producer: completedMessage.producer,
            schemaVersion: completedMessage.schemaVersion,
            workspaceId: completedMessage.workspaceId
          }
        }
      });

      return completedSnapshot;
    });
  } catch (error) {
    const failure = normalizeFailure(error);
    await prisma.enrichmentSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: EnrichmentStatus.FAILED,
        errorCode: failure.code,
        errorMessage: failure.message,
        completedAt: new Date()
      }
    });
    throw failure;
  }
}

function createCompletedMessage(
  request: LeadEnrichmentRequestedMessage,
  snapshotId: string,
  result: { provider: string; confidence: number }
): LeadEnrichmentCompletedMessage & { idempotencyKey: string } {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted,
    eventId: randomUUID(),
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: new Date().toISOString(),
    workspaceId: request.workspaceId,
    correlationId: request.correlationId,
    causationId: request.eventId,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.engagementWorker,
    actor: { type: "system", id: "lead-enrichment-worker" },
    idempotencyKey: `lead.enrichment.completed:${request.payload.registrationId}`,
    payload: {
      eventId: request.payload.eventId,
      leadId: request.payload.leadId,
      registrationId: request.payload.registrationId,
      snapshotId,
      provider: result.provider,
      confidence: result.confidence
    }
  };
}

function normalizeFailure(error: unknown): LeadEnrichmentError {
  if (error instanceof LeadEnrichmentError) {
    return error;
  }

  return new LeadEnrichmentError(
    "lead_enrichment_provider_failed",
    error instanceof Error ? error.message : String(error),
    true,
    error instanceof Error ? { cause: error } : undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildPreEventSchedule(startsAt: Date, now: Date) {
  const day = 86_400_000;
  return [
    { key: "welcome", dueAt: now, type: ScheduledActionType.AGENT_DECISION },
    { key: "d14", dueAt: new Date(startsAt.getTime() - 14 * day), type: ScheduledActionType.REQUEST_CONFIRMATION },
    { key: "d7", dueAt: new Date(startsAt.getTime() - 7 * day), type: ScheduledActionType.REQUEST_CONFIRMATION },
    { key: "d3", dueAt: new Date(startsAt.getTime() - 3 * day), type: ScheduledActionType.FOLLOW_UP },
    { key: "d1", dueAt: new Date(startsAt.getTime() - day), type: ScheduledActionType.FOLLOW_UP }
  ].filter((step, index) => index === 0 || step.dueAt > now);
}
