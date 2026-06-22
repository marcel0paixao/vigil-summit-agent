import assert from "node:assert/strict";
import { test } from "node:test";

import { EventStatus, RegistrationStatus } from "@prisma/client/index";

import type { PrismaService } from "../prisma/prisma.service.js";
import { EventsService } from "./events.service.js";

test("EventsService creates a validated draft event", async () => {
  let createArgs: unknown;
  const prisma = {
    event: {
      create: async (args: unknown) => {
        createArgs = args;
        return { id: "event-1", status: EventStatus.DRAFT };
      }
    }
  } as unknown as PrismaService;
  const service = new EventsService(prisma);

  const result = await service.create("workspace-1", {
    name: "Vigil Summit",
    slug: "vigil-summit",
    startsAt: "2026-09-18T09:00:00-03:00",
    endsAt: "2026-09-18T18:00:00-03:00",
    timezone: "America/Sao_Paulo",
    capacity: 120
  });

  assert.equal(result.id, "event-1");
  assert.deepEqual(createArgs, {
    data: {
      workspaceId: "workspace-1",
      name: "Vigil Summit",
      slug: "vigil-summit",
      description: undefined,
      location: undefined,
      startsAt: new Date("2026-09-18T09:00:00-03:00"),
      endsAt: new Date("2026-09-18T18:00:00-03:00"),
      timezone: "America/Sao_Paulo",
      capacity: 120
    }
  });
});

test("EventsService waitlists registrations at capacity and queues enrichment", async () => {
  let registrationCreateArgs: any;
  let consentCreateArgs: any;
  let outboxCreateArgs: any;
  const transaction = {
    event: {
      findFirst: async () => ({
        id: "event-1",
        workspaceId: "workspace-1",
        capacity: 120
      })
    },
    lead: {
      findUnique: async () => null,
      upsert: async () => ({ id: "lead-1" })
    },
    registration: {
      count: async () => 120,
      create: async (args: any) => {
        registrationCreateArgs = args;
        return { id: "registration-1", status: args.data.status };
      }
    },
    consentRecord: {
      createMany: async (args: any) => {
        consentCreateArgs = args;
        return { count: args.data.length };
      }
    },
    outboxMessage: {
      create: async (args: any) => {
        outboxCreateArgs = args;
        return { id: "outbox-1" };
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction)
  } as unknown as PrismaService;
  const service = new EventsService(prisma);

  const result = await service.register("event-1", {
    fullName: "Mariana Costa",
    workEmail: "MARIANA@FINTECH.EXAMPLE",
    jobTitle: "CISO",
    companyName: "Fintech Example",
    companyDomain: "FINTECH.EXAMPLE",
    interestTopics: ["SOC 2"],
    privacyNoticeVersion: "2026-06-20",
    eventCommunicationConsent: true,
    commercialFollowUpConsent: true
  });

  assert.equal(result.status, RegistrationStatus.WAITLISTED);
  assert.equal(registrationCreateArgs.data.status, RegistrationStatus.WAITLISTED);
  assert.equal(consentCreateArgs.data.length, 2);
  assert.equal(outboxCreateArgs.data.eventName, "lead.enrichment.requested");
  assert.equal(outboxCreateArgs.data.idempotencyKey, "lead.enrichment.requested:registration-1");
});

test("EventsService returns an existing registration without duplicate side effects", async () => {
  let countCalled = false;
  const transaction = {
    event: {
      findFirst: async () => ({
        id: "event-1",
        workspaceId: "workspace-1",
        capacity: 120
      })
    },
    lead: {
      findUnique: async () => ({ id: "lead-1" })
    },
    registration: {
      findUnique: async () => ({ id: "registration-1", status: RegistrationStatus.REGISTERED }),
      count: async () => {
        countCalled = true;
        return 0;
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction)
  } as unknown as PrismaService;
  const service = new EventsService(prisma);

  const result = await service.register("event-1", {
    fullName: "Mariana Costa",
    workEmail: "mariana@fintech.example",
    companyName: "Fintech Example",
    privacyNoticeVersion: "2026-06-20",
    eventCommunicationConsent: true
  });

  assert.equal(result.created, false);
  assert.equal(result.registrationId, "registration-1");
  assert.equal(countCalled, false);
});
