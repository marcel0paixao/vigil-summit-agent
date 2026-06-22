import assert from "node:assert/strict";
import { test } from "node:test";

import { ConflictException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client/index";
import { hash } from "bcryptjs";

import { AuthService } from "./auth.service.js";

test("AuthService registers a new user without returning passwordHash", async () => {
  const createdUser = {
    id: "user-1",
    email: "owner@example.test",
    displayName: "Owner Example"
  };

  const prisma = {
    user: {
      findUnique: mockAsync(null),
      create: mockAsync(createdUser)
    }
  };

  const service = new AuthService(prisma as never, fakeJwtService());

  const result = await service.register({
    email: "OWNER@EXAMPLE.TEST",
    displayName: "Owner Example",
    password: "correct horse battery staple"
  });

  assert.deepEqual(result, { user: createdUser });
  assert.equal(prisma.user.create.calls[0]?.[0].data.email, "owner@example.test");
  assert.equal(typeof prisma.user.create.calls[0]?.[0].data.passwordHash, "string");
});

test("AuthService refuses to register an email that already has credentials", async () => {
  const prisma = {
    user: {
      findUnique: mockAsync({
        id: "user-1",
        passwordHash: "existing-hash"
      })
    }
  };

  const service = new AuthService(prisma as never, fakeJwtService());

  await assert.rejects(
    () =>
      service.register({
        email: "owner@example.test",
        displayName: "Owner Example",
        password: "correct horse battery staple"
      }),
    ConflictException
  );
});

test("AuthService logs in with workspace role claims", async () => {
  const passwordHash = await hash("correct horse battery staple", 12);
  const prisma = {
    user: {
      findUnique: mockAsync({
        id: "user-1",
        email: "owner@example.test",
        displayName: "Owner Example",
        passwordHash,
        memberships: [
          {
            workspaceId: "workspace-1",
            role: WorkspaceRole.OWNER
          }
        ]
      })
    }
  };
  const jwtService = fakeJwtService();
  const service = new AuthService(prisma as never, jwtService);

  const result = await service.login({
    email: "OWNER@EXAMPLE.TEST",
    password: "correct horse battery staple",
    workspaceId: "workspace-1"
  });

  assert.equal(result.accessToken, "signed-token");
  assert.deepEqual(result.workspace, {
    id: "workspace-1",
    role: WorkspaceRole.OWNER
  });
  assert.deepEqual(jwtService.signAsync.calls[0]?.[0], {
    sub: "user-1",
    email: "owner@example.test",
    workspaceId: "workspace-1",
    role: WorkspaceRole.OWNER
  });
});

test("AuthService rejects login for a workspace where the user is not a member", async () => {
  const passwordHash = await hash("correct horse battery staple", 12);
  const prisma = {
    user: {
      findUnique: mockAsync({
        id: "user-1",
        email: "owner@example.test",
        displayName: "Owner Example",
        passwordHash,
        memberships: []
      })
    }
  };

  const service = new AuthService(prisma as never, fakeJwtService());

  await assert.rejects(
    () =>
      service.login({
        email: "owner@example.test",
        password: "correct horse battery staple",
        workspaceId: "workspace-2"
      }),
    ForbiddenException
  );
});

test("AuthService rejects invalid credentials", async () => {
  const passwordHash = await hash("correct horse battery staple", 12);
  const prisma = {
    user: {
      findUnique: mockAsync({
        id: "user-1",
        email: "owner@example.test",
        displayName: "Owner Example",
        passwordHash,
        memberships: []
      })
    }
  };

  const service = new AuthService(prisma as never, fakeJwtService());

  await assert.rejects(
    () =>
      service.login({
        email: "owner@example.test",
        password: "wrong password"
      }),
    UnauthorizedException
  );
});

test("AuthService returns current user profile without passwordHash", async () => {
  const user = {
    id: "user-1",
    email: "owner@example.test",
    displayName: "Owner Example",
    memberships: [
      {
        role: WorkspaceRole.OWNER,
        workspace: {
          id: "workspace-1",
          name: "Example Workspace",
          slug: "example-workspace"
        }
      }
    ]
  };
  const prisma = {
    user: {
      findUnique: mockAsync(user)
    }
  };

  const service = new AuthService(prisma as never, fakeJwtService());

  const result = await service.me("user-1");

  assert.deepEqual(result, { user });
  assert.equal("passwordHash" in result.user, false);
});

function fakeJwtService() {
  return {
    signAsync: mockAsync("signed-token")
  } as never as {
    signAsync: ReturnType<typeof mockAsync<string>>;
  };
}

function mockAsync<T>(value: T) {
  const calls: any[][] = [];
  const fn = async (...args: any[]) => {
    calls.push(args);
    return value;
  };

  return Object.assign(fn, { calls });
}
