import assert from "node:assert/strict";
import { test } from "node:test";

import { ForbiddenException } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client/index";

import type { AuthenticatedRequest } from "../types/current-user.js";
import { WorkspaceRolesGuard } from "./workspace-roles.guard.js";

test("WorkspaceRolesGuard allows a matching workspace membership", async () => {
  const request = {
    params: {
      id: "workspace-1"
    },
    user: {
      sub: "user-1",
      email: "owner@example.test"
    }
  } as AuthenticatedRequest & { params: { id: string } };
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        workspaceId: "workspace-1",
        role: WorkspaceRole.OWNER
      })
    }
  };
  const guard = new WorkspaceRolesGuard(fakeReflector([WorkspaceRole.OWNER]), prisma as never);

  const result = await guard.canActivate(httpContext(request));

  assert.equal(result, true);
  assert.deepEqual(request.workspaceMembership, {
    workspaceId: "workspace-1",
    role: WorkspaceRole.OWNER
  });
  const findUniqueArgs = prisma.workspaceMember.findUnique.calls[0]?.[0] as {
    where: unknown;
  };

  assert.deepEqual(findUniqueArgs.where, {
    workspaceId_userId: {
      workspaceId: "workspace-1",
      userId: "user-1"
    }
  });
});

test("WorkspaceRolesGuard rejects missing or insufficient workspace membership", async () => {
  const request = {
    params: {
      id: "workspace-1"
    },
    user: {
      sub: "user-1",
      email: "owner@example.test"
    }
  };
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        workspaceId: "workspace-1",
        role: WorkspaceRole.VIEWER
      })
    }
  };
  const guard = new WorkspaceRolesGuard(fakeReflector([WorkspaceRole.OWNER]), prisma as never);

  await assert.rejects(() => guard.canActivate(httpContext(request)), ForbiddenException);
});

function fakeReflector(roles: WorkspaceRole[]) {
  return {
    getAllAndOverride: () => roles
  } as never;
}

function httpContext(request: unknown) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as never;
}

function mockAsync<T>(value: T) {
  const calls: unknown[][] = [];
  const fn = async (...args: unknown[]) => {
    calls.push(args);
    return value;
  };

  return Object.assign(fn, { calls });
}
