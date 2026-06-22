import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import {
  EventStatus,
  LeadSource,
  PrismaClient,
  RegistrationStatus
} from "@prisma/client/index";

import { processLeadEnrichment } from "./process-lead-enrichment.js";
import { SyntheticEnrichmentProvider } from "./synthetic-enrichment-provider.js";

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot_test";

const prisma = new PrismaClient();
const workspaceSlug = "enrichment-worker-integration";

after(async () => {
  await prisma.outboxMessage.deleteMany({
    where: { idempotencyKey: { contains: "enrichment-integration" } }
  });
  await prisma.workspace.deleteMany({ where: { slug: workspaceSlug } });
  await prisma.$disconnect();
});

test("processes a lead enrichment command idempotently against PostgreSQL", async () => {
  await prisma.outboxMessage.deleteMany({
    where: { idempotencyKey: { contains: "enrichment-integration" } }
  });
  await prisma.workspace.deleteMany({ where: { slug: workspaceSlug } });

  const workspace = await prisma.workspace.create({
    data: {
      id: "enrichment-integration-workspace",
      name: "Enrichment Worker Integration",
      slug: workspaceSlug
    }
  });
  const event = await prisma.event.create({
    data: {
      id: "enrichment-integration-event",
      workspaceId: workspace.id,
      name: "Vigil Summit Integration",
      slug: "vigil-summit-integration",
      startsAt: new Date("2026-09-18T12:00:00.000Z"),
      timezone: "America/Sao_Paulo",
      capacity: 10,
      status: EventStatus.PUBLISHED
    }
  });
  const lead = await prisma.lead.create({
    data: {
      id: "enrichment-integration-lead",
      workspaceId: workspace.id,
      fullName: "Mariana Costa (Demo)",
      workEmail: "mariana.costa@fintech-demo.test",
      normalizedWorkEmail: "mariana.costa@fintech-demo.test",
      jobTitle: "CISO",
      companyName: "Fintech Demo",
      companyDomain: "fintech-demo.test",
      source: LeadSource.DEMO
    }
  });
  const registration = await prisma.registration.create({
    data: {
      id: "enrichment-integration-registration",
      workspaceId: workspace.id,
      eventId: event.id,
      leadId: lead.id,
      status: RegistrationStatus.REGISTERED,
      interestTopics: ["AI risk", "SOC 2"]
    }
  });
  const message: LeadEnrichmentRequestedMessage = {
    eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
    eventId: "enrichment-integration-message",
    schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
    occurredAt: "2026-06-20T12:00:00.000Z",
    workspaceId: workspace.id,
    correlationId: `enrichment-integration:${registration.id}`,
    producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
    payload: {
      eventId: event.id,
      leadId: lead.id,
      registrationId: registration.id
    }
  };
  const provider = new SyntheticEnrichmentProvider();

  const first = await processLeadEnrichment(message, prisma, provider);
  const second = await processLeadEnrichment(message, prisma, provider);

  assert.equal(first.id, second.id);
  assert.equal(first.status, "SUCCEEDED");
  assert.equal(first.companyIndustry, "Financial services");
  assert.equal(
    await prisma.enrichmentSnapshot.count({ where: { registrationId: registration.id } }),
    1
  );
  assert.equal(
    await prisma.interestSignal.count({ where: { registrationId: registration.id } }),
    4
  );
  assert.equal(
    await prisma.outboxMessage.count({
      where: { idempotencyKey: `lead.enrichment.completed:${registration.id}` }
    }),
    1
  );
});
