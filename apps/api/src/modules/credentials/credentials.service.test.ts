import assert from "node:assert/strict";
import { test } from "node:test";

import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client/index";

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot";
process.env.RABBITMQ_URL ??= "amqp://flowpilot:flowpilot@localhost:5672";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.QDRANT_URL ??= "http://localhost:6333";
process.env.JWT_SECRET ??= "test-secret-with-at-least-twenty-four-characters";

test("CredentialsService creates encrypted credentials without returning secret values", async () => {
  const persistedCredential = {
    id: "credential-1",
    workspaceId: "workspace-1",
    name: "OpenRouter personal",
    type: "openrouter",
    kind: "llm",
    capabilities: ["llm.chat", "llm.structured_output"],
    encryptedValue: "encrypted",
    iv: "iv",
    authTag: "tag",
    lastUsedAt: null,
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
    updatedAt: new Date("2026-05-26T12:00:00.000Z")
  };
  const prisma = {
    integrationCredential: {
      create: mockAsync(persistedCredential)
    }
  };
  const CredentialsService = await getCredentialsService();
  const service = new CredentialsService(prisma as never);

  const result = await service.create("workspace-1", "user-1", {
    name: "OpenRouter personal",
    type: "openrouter",
    kind: "llm",
    capabilities: ["llm.chat", "llm.structured_output"],
    value: "sk-test"
  });

  const createArgs = prisma.integrationCredential.create.calls[0]?.[0] as {
    data: {
      encryptedValue: string;
      value?: string;
      createdByUserId: string;
      kind: string;
      capabilities: string[];
    };
  };

  assert.equal(createArgs.data.createdByUserId, "user-1");
  assert.equal(createArgs.data.kind, "llm");
  assert.deepEqual(createArgs.data.capabilities, ["llm.chat", "llm.structured_output"]);
  assert.equal(createArgs.data.value, undefined);
  assert.notEqual(createArgs.data.encryptedValue, "sk-test");
  assert.deepEqual(result, {
    id: "credential-1",
    workspaceId: "workspace-1",
    name: "OpenRouter personal",
    type: "openrouter",
    kind: "llm",
    capabilities: ["llm.chat", "llm.structured_output"],
    lastUsedAt: null,
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
    updatedAt: new Date("2026-05-26T12:00:00.000Z")
  });
});

test("CredentialsService resolves credential secrets for internal callers", async () => {
  const CredentialsService = await getCredentialsService();
  const createPrisma = {
    integrationCredential: {
      create: mockAsync({
        id: "credential-1",
        workspaceId: "workspace-1",
        name: "OpenRouter personal",
        type: "openrouter",
        kind: "llm",
        capabilities: ["llm.chat", "llm.structured_output"],
        encryptedValue: "encrypted",
        iv: "iv",
        authTag: "tag",
        lastUsedAt: null,
        createdAt: new Date("2026-05-26T12:00:00.000Z"),
        updatedAt: new Date("2026-05-26T12:00:00.000Z")
      })
    }
  };
  const createService = new CredentialsService(createPrisma as never);

  await createService.create("workspace-1", "user-1", {
    name: "OpenRouter personal",
    type: "openrouter",
    kind: "llm",
    capabilities: ["llm.chat", "llm.structured_output"],
    value: "sk-test"
  });

  const createArgs = createPrisma.integrationCredential.create.calls[0]?.[0] as {
    data: {
      encryptedValue: string;
      iv: string;
      authTag: string;
    };
  };
  const lookupService = new CredentialsService({
    integrationCredential: {
      findFirst: mockAsync({
        id: "credential-1",
        workspaceId: "workspace-1",
        type: "openrouter",
        kind: "llm",
        capabilities: ["llm.chat", "llm.structured_output"],
        encryptedValue: createArgs.data.encryptedValue,
        iv: createArgs.data.iv,
        authTag: createArgs.data.authTag
      })
    }
  } as never);

  const result = await lookupService.findSecret("workspace-1", "credential-1");

  assert.deepEqual(result, {
    id: "credential-1",
    workspaceId: "workspace-1",
    type: "openrouter",
    kind: "llm",
    capabilities: ["llm.chat", "llm.structured_output"],
    value: "sk-test"
  });
});

test("CredentialsService rejects duplicate credential names per type", async () => {
  const prisma = {
    integrationCredential: {
      create: async () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          clientVersion: "test",
          code: "P2002"
        });
      }
    }
  };
  const CredentialsService = await getCredentialsService();
  const service = new CredentialsService(prisma as never);

  await assert.rejects(
    () =>
      service.create("workspace-1", "user-1", {
        name: "OpenRouter personal",
        type: "openrouter",
        kind: "llm",
        capabilities: ["llm.chat", "llm.structured_output"],
        value: "sk-test"
      }),
    ConflictException
  );
});

test("CredentialsService removes workspace credentials by id", async () => {
  const prisma = {
    integrationCredential: {
      deleteMany: mockAsync({ count: 1 })
    }
  };
  const CredentialsService = await getCredentialsService();
  const service = new CredentialsService(prisma as never);

  const result = await service.remove("workspace-1", "credential-1");

  assert.deepEqual(result, {
    id: "credential-1",
    deleted: true
  });
  assert.deepEqual(prisma.integrationCredential.deleteMany.calls[0]?.[0], {
    where: {
      id: "credential-1",
      workspaceId: "workspace-1"
    }
  });
});

test("CredentialsService throws NotFoundException when removing missing credentials", async () => {
  const prisma = {
    integrationCredential: {
      deleteMany: mockAsync({ count: 0 })
    }
  };
  const CredentialsService = await getCredentialsService();
  const service = new CredentialsService(prisma as never);

  await assert.rejects(() => service.remove("workspace-1", "missing"), NotFoundException);
});

function mockAsync<TReturn>(returnValue: TReturn) {
  const calls: unknown[][] = [];
  const fn = async (...args: unknown[]) => {
    calls.push(args);
    return returnValue;
  };

  return Object.assign(fn, { calls });
}

async function getCredentialsService() {
  const module = await import("./credentials.service.js");

  return module.CredentialsService;
}
