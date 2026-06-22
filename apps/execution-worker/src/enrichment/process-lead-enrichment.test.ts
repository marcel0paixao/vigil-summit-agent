import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import { EnrichmentStatus, type PrismaClient } from "@prisma/client/index";

import { type EnrichmentProvider } from "./enrichment-provider.js";
import { processLeadEnrichment } from "./process-lead-enrichment.js";

test("persists an enrichment snapshot, provenance signals, and completion outbox atomically", async () => {
  const writes: Record<string, unknown> = {};
  const transaction = {
    enrichmentSnapshot: {
      update: async (args: unknown) => {
        writes.snapshot = args;
        return { id: "snapshot-1", status: EnrichmentStatus.SUCCEEDED };
      }
    },
    interestSignal: {
      createMany: async (args: unknown) => {
        writes.signals = args;
        return { count: 4 };
      }
    },
    leadQualification: {
      upsert: async (args: unknown) => {
        writes.qualification = args;
        return { id: "qualification-1" };
      }
    },
    consentRecord: {
      findFirst: async () => ({ id: "consent-1" })
    },
    conversation: {
      upsert: async (args: unknown) => {
        writes.conversation = args;
        return { id: "conversation-1" };
      }
    },
    cadenceEnrollment: {
      upsert: async (args: unknown) => {
        writes.enrollment = args;
        return { id: "enrollment-1" };
      }
    },
    scheduledAction: {
      upsert: async (args: unknown) => {
        const actions = (writes.scheduledActions as unknown[] | undefined) ?? [];
        actions.push(args);
        writes.scheduledActions = actions;
        return { id: "action-1" };
      }
    },
    outboxMessage: {
      upsert: async (args: unknown) => {
        writes.outbox = args;
        return { id: "outbox-1" };
      }
    }
  };
  const prisma = {
    registration: {
      findFirst: async () => registrationFixture()
    },
    enrichmentSnapshot: {
      findUnique: async () => null,
      upsert: async () => ({ id: "snapshot-1", status: EnrichmentStatus.PENDING }),
      update: async () => ({ id: "snapshot-1" })
    },
    $transaction: async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction)
  } as unknown as PrismaClient;

  const result = await processLeadEnrichment(messageFixture(), prisma, providerFixture());

  assert.equal(result.status, EnrichmentStatus.SUCCEEDED);
  const signalWrite = writes.signals as {
    data: Array<{ source: string; value: string }>;
    skipDuplicates: boolean;
  };
  assert.equal(signalWrite.skipDuplicates, true);
  assert.deepEqual(
    signalWrite.data.map((signal) => `${signal.source}:${signal.value}`),
    [
      "DECLARED:AI risk",
      "DECLARED:SOC 2",
      "ENRICHED:SOC 2 compliance",
      "ENRICHED:AI risk governance"
    ]
  );
  const outboxWrite = writes.outbox as {
    create: { eventName: string; idempotencyKey: string; payload: { payload: { snapshotId: string } } };
  };
  assert.equal(outboxWrite.create.eventName, FLOWPILOT_ROUTING_KEYS.leadEnrichmentCompleted);
  assert.equal(outboxWrite.create.idempotencyKey, "lead.enrichment.completed:registration-1");
  assert.equal(outboxWrite.create.payload.payload.snapshotId, "snapshot-1");
  const qualificationWrite = writes.qualification as {
    create: { score: number; status: string; policyVersion: string };
  };
  assert.equal(qualificationWrite.create.status, "QUALIFIED");
  assert.equal(qualificationWrite.create.score, 100);
  assert.equal(qualificationWrite.create.policyVersion, "v1");
  const actionWrites = writes.scheduledActions as Array<{
    create: { enrollmentId: string; payload: { action: string }; idempotencyKey: string };
  }>;
  const actionWrite = actionWrites[0]!;
  assert.equal(actionWrites.length, 5);
  assert.equal(actionWrite.create.enrollmentId, "enrollment-1");
  assert.equal(actionWrite.create.payload.action, "welcome");
  assert.equal(actionWrite.create.idempotencyKey, "cadence:registration-1:welcome");
});

test("does not call the provider again after a registration was enriched", async () => {
  let providerCalls = 0;
  const existing = { id: "snapshot-1", status: EnrichmentStatus.SUCCEEDED };
  const prisma = {
    registration: { findFirst: async () => registrationFixture() },
    enrichmentSnapshot: { findUnique: async () => existing }
  } as unknown as PrismaClient;
  const provider: EnrichmentProvider = {
    name: "synthetic",
    version: "v1",
    enrich: async () => {
      providerCalls += 1;
      return providerFixture().enrich({} as never);
    }
  };

  const result = await processLeadEnrichment(messageFixture(), prisma, provider);

  assert.equal(result, existing);
  assert.equal(providerCalls, 0);
});

function providerFixture(): EnrichmentProvider {
  return {
    name: "synthetic",
    version: "v1",
    enrich: async () => ({
      provider: "synthetic",
      providerVersion: "v1",
      jobTitle: "CISO",
      seniority: "EXECUTIVE",
      roleCategory: "SECURITY",
      companyName: "Fintech Demo",
      companyDomain: "fintech-demo.test",
      companyIndustry: "Financial services",
      companyEmployeeRange: "501-1000",
      professionalProfileUrl: "https://professional-profiles.test/fintech-demo.test/mariana",
      securitySignals: ["SOC 2 compliance", "AI risk governance"],
      confidence: 0.96,
      evidence: [
        {
          field: "companyProfile",
          source: "synthetic_demo_dataset",
          detail: "Exact domain match"
        }
      ],
      providerPayload: { matchStrategy: "exact_demo_domain" }
    })
  };
}

function registrationFixture() {
  return {
    id: "registration-1",
    workspaceId: "workspace-1",
    eventId: "event-1",
    leadId: "lead-1",
    interestTopics: ["AI risk", "SOC 2"],
    event: {
      startsAt: new Date("2026-09-18T12:00:00Z"),
      audienceProfile: {
        companyMinimumEmployees: 200,
        targetRoles: ["CISO", "CTO"]
      }
    },
    lead: {
      fullName: "Mariana Costa (Demo)",
      workEmail: "mariana.costa@fintech-demo.test",
      jobTitle: "CISO",
      companyName: "Fintech Demo",
      companyDomain: "fintech-demo.test"
    }
  };
}

function messageFixture(): LeadEnrichmentRequestedMessage {
  return {
    eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
    eventId: "message-1",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-06-20T12:00:00.000Z",
    workspaceId: "workspace-1",
    correlationId: "registration:registration-1",
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    payload: {
      eventId: "event-1",
      leadId: "lead-1",
      registrationId: "registration-1"
    }
  };
}
