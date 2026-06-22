import {
  CommunicationChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  EventStatus,
  LeadSource,
  Prisma,
  PrismaClient,
  RegistrationStatus,
  WorkspaceRole
} from "@prisma/client/index";
import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_MESSAGE_PRODUCERS,
  FLOWPILOT_MESSAGE_SCHEMA_VERSION,
  FLOWPILOT_ROUTING_KEYS,
  type LeadEnrichmentRequestedMessage
} from "@flowpilot/contracts";
import { hash } from "bcryptjs";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: new URL("../../../.env", import.meta.url), quiet: true });

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot";

const prisma = new PrismaClient();
const demoAdminPassword = "VigilDemo2026!ChangeMe";

const personas = [
  {
    fullName: "Mariana Costa (Demo)",
    workEmail: "mariana.costa@fintech-demo.test",
    jobTitle: "CISO",
    companyName: "Fintech Demo",
    companyDomain: "fintech-demo.test",
    status: RegistrationStatus.CONFIRMED,
    interestTopics: ["SOC 2", "AI risk"]
  },
  {
    fullName: "Carlos Almeida (Demo)",
    workEmail: "carlos.almeida@health-demo.test",
    jobTitle: "CTO",
    companyName: "Health Demo",
    companyDomain: "health-demo.test",
    status: RegistrationStatus.REGISTERED,
    interestTopics: ["LGPD", "continuous monitoring"]
  },
  {
    fullName: "Ana Ribeiro (Demo)",
    workEmail: "ana.ribeiro@industry-demo.test",
    jobTitle: "IT Director",
    companyName: "Industry Demo",
    companyDomain: "industry-demo.test",
    status: RegistrationStatus.WAITLISTED,
    interestTopics: ["ISO 27001", "remediation"]
  }
] as const;

async function main(): Promise<void> {
  const passwordHash = await hash(demoAdminPassword, 12);
  const workspace = await prisma.workspace.upsert({
    where: { slug: "vigil-ai" },
    create: {
      name: "Vigil.AI",
      slug: "vigil-ai"
    },
    update: { name: "Vigil.AI" }
  });
  const demoAdmin = await prisma.user.upsert({
    where: { email: "demo-admin@vigil.test" },
    create: {
      email: "demo-admin@vigil.test",
      displayName: "Vigil Demo Administrator",
      passwordHash
    },
    update: {
      displayName: "Vigil Demo Administrator",
      passwordHash
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: demoAdmin.id
      }
    },
    create: {
      workspaceId: workspace.id,
      userId: demoAdmin.id,
      role: WorkspaceRole.OWNER
    },
    update: { role: WorkspaceRole.OWNER }
  });

  const event = await prisma.event.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: "vigil-summit-2026"
      }
    },
    create: {
      workspaceId: workspace.id,
      name: "Vigil Summit - Seguranca para a Era da IA",
      slug: "vigil-summit-2026",
      description:
        "Encontro executivo para CISOs, CTOs e lideres de risco sobre seguranca, conformidade e IA.",
      location: "Sao Paulo, SP",
      startsAt: new Date("2026-09-18T12:00:00.000Z"),
      endsAt: new Date("2026-09-18T21:00:00.000Z"),
      timezone: "America/Sao_Paulo",
      capacity: 120,
      status: EventStatus.PUBLISHED,
      audienceProfile: {
        companyMinimumEmployees: 200,
        targetRoles: ["CISO", "CTO", "IT Director", "Risk Manager"]
      }
    },
    update: {
      name: "Vigil Summit - Seguranca para a Era da IA",
      status: EventStatus.PUBLISHED
    }
  });

  for (const persona of personas) {
    const lead = await prisma.lead.upsert({
      where: {
        workspaceId_normalizedWorkEmail: {
          workspaceId: workspace.id,
          normalizedWorkEmail: persona.workEmail
        }
      },
      create: {
        workspaceId: workspace.id,
        fullName: persona.fullName,
        workEmail: persona.workEmail,
        normalizedWorkEmail: persona.workEmail,
        jobTitle: persona.jobTitle,
        companyName: persona.companyName,
        companyDomain: persona.companyDomain,
        source: LeadSource.DEMO
      },
      update: {
        fullName: persona.fullName,
        jobTitle: persona.jobTitle,
        companyName: persona.companyName,
        companyDomain: persona.companyDomain,
        source: LeadSource.DEMO
      }
    });

    const registration = await prisma.registration.upsert({
      where: {
        eventId_leadId: {
          eventId: event.id,
          leadId: lead.id
        }
      },
      create: {
        workspaceId: workspace.id,
        eventId: event.id,
        leadId: lead.id,
        status: persona.status,
        interestTopics: [...persona.interestTopics],
        confirmedAt:
          persona.status === RegistrationStatus.CONFIRMED ? new Date("2026-06-20T15:00:00Z") : null
      },
      update: {
        status: persona.status,
        interestTopics: [...persona.interestTopics]
      }
    });

    const enrichmentIdempotencyKey = `lead.enrichment.requested:${registration.id}`;
    const enrichmentMessage: LeadEnrichmentRequestedMessage = {
      eventName: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
      eventId: randomUUID(),
      schemaVersion: FLOWPILOT_MESSAGE_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      workspaceId: workspace.id,
      correlationId: `registration:${registration.id}`,
      producer: FLOWPILOT_MESSAGE_PRODUCERS.api,
      actor: { type: "system", id: "vigil-demo-seed" },
      idempotencyKey: enrichmentIdempotencyKey,
      payload: {
        eventId: event.id,
        leadId: lead.id,
        registrationId: registration.id
      }
    };

    await prisma.outboxMessage.upsert({
      where: { idempotencyKey: enrichmentIdempotencyKey },
      create: {
        exchange: FLOWPILOT_EXCHANGES.commands,
        routingKey: enrichmentMessage.eventName,
        eventName: enrichmentMessage.eventName,
        messageId: enrichmentMessage.eventId,
        idempotencyKey: enrichmentIdempotencyKey,
        payload: enrichmentMessage as unknown as Prisma.InputJsonObject,
        headers: {
          correlationId: enrichmentMessage.correlationId,
          producer: enrichmentMessage.producer,
          schemaVersion: enrichmentMessage.schemaVersion,
          workspaceId: enrichmentMessage.workspaceId
        }
      },
      update: {}
    });

    await prisma.consentRecord.deleteMany({
      where: {
        eventId: event.id,
        leadId: lead.id,
        source: "vigil_demo_seed"
      }
    });
    await prisma.consentRecord.createMany({
      data: [ConsentPurpose.EVENT_COMMUNICATION, ConsentPurpose.COMMERCIAL_FOLLOW_UP].map(
        (purpose) => ({
          workspaceId: workspace.id,
          eventId: event.id,
          leadId: lead.id,
          purpose,
          legalBasis: ConsentLegalBasis.CONSENT,
          channel: CommunicationChannel.EMAIL,
          noticeVersion: "2026-06-20",
          source: "vigil_demo_seed"
        })
      )
    });
  }

  console.log("Vigil Summit seed completed");
  console.log(`Workspace ID: ${workspace.id}`);
  console.log(`Event ID: ${event.id}`);
  console.log(`Public registration: http://localhost:5173/events/${event.id}/register`);
  console.log(`Demo admin: ${demoAdmin.email} / ${demoAdminPassword}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
