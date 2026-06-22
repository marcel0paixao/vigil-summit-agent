import assert from "node:assert/strict";
import { test } from "node:test";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client/index";

import { WorkspacesService } from "./workspaces.service.js";

test("WorkspacesService creates a workspace with an owner membership", async () => {
  const persistedWorkspace = {
    id: "workspace-1",
    name: "Example Workspace",
    slug: "example-workspace",
    members: [
      {
        role: WorkspaceRole.OWNER,
        user: {
          id: "user-1",
          email: "owner@example.test",
          displayName: "Owner Example"
        }
      }
    ]
  };

  const tx = {
    workspace: {
      create: mockAsync(persistedWorkspace)
    }
  };

  const prisma = {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx)
  };

  const service = new WorkspacesService(prisma as never);

  const result = await service.create({
    name: "Example Workspace",
    slug: "example-workspace"
  }, "user-1");

  assert.equal(result, persistedWorkspace);
  const workspaceCreateArgs = tx.workspace.create.calls[0]?.[0] as {
    data: { members: { create: { role: WorkspaceRole; userId: string } } };
  };

  assert.equal(workspaceCreateArgs.data.members.create.userId, "user-1");
  assert.equal(workspaceCreateArgs.data.members.create.role, WorkspaceRole.OWNER);
});

test("WorkspacesService lists only workspaces where the user is a member", async () => {
  const workspaces = [{ id: "workspace-1" }];
  const prisma = {
    workspace: {
      findMany: mockAsync(workspaces)
    }
  };

  const service = new WorkspacesService(prisma as never);

  const result = await service.findAllForUser("user-1");

  assert.equal(result, workspaces);
  const findManyArgs = prisma.workspace.findMany.calls[0]?.[0] as {
    where: { members: { some: { userId: string } } };
    orderBy: { createdAt: "desc" };
  };

  assert.equal(findManyArgs.where.members.some.userId, "user-1");
  assert.equal(findManyArgs.orderBy.createdAt, "desc");
});

test("WorkspacesService throws NotFoundException when a workspace does not exist", async () => {
  const prisma = {
    workspace: {
      findUnique: mockAsync(null)
    }
  };

  const service = new WorkspacesService(prisma as never);

  await assert.rejects(() => service.findOne("missing-workspace"), NotFoundException);
});

test("WorkspacesService adds a member when actor can assign the requested role", async () => {
  const actorMembership = {
    id: "member-owner",
    userId: "owner-1",
    role: WorkspaceRole.OWNER
  };
  const addedMember = {
    id: "member-1",
    role: WorkspaceRole.ADMIN
  };
  const tx = {
    user: {
      upsert: mockAsync({
        id: "user-2",
        email: "admin@example.test"
      })
    },
    workspaceMember: {
      create: mockAsync(addedMember)
    }
  };
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync(actorMembership)
    },
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx)
  };
  const service = new WorkspacesService(prisma as never);

  const result = await service.addMember("workspace-1", "owner-1", {
    email: "ADMIN@EXAMPLE.TEST",
    displayName: "Admin Example",
    role: WorkspaceRole.ADMIN
  });

  assert.equal(result, addedMember);
  assert.equal(tx.user.upsert.calls[0]?.[0].where.email, "admin@example.test");
  assert.equal(tx.workspaceMember.create.calls[0]?.[0].data.role, WorkspaceRole.ADMIN);
});

test("WorkspacesService rejects assigning owner role through member management", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-owner",
        userId: "owner-1",
        role: WorkspaceRole.OWNER
      })
    }
  };
  const service = new WorkspacesService(prisma as never);

  await assert.rejects(
    () =>
      service.addMember("workspace-1", "owner-1", {
        email: "owner-2@example.test",
        role: WorkspaceRole.OWNER
      }),
    ForbiddenException
  );
});

test("WorkspacesService rejects admins assigning admin role", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-admin",
        userId: "admin-1",
        role: WorkspaceRole.ADMIN
      })
    }
  };
  const service = new WorkspacesService(prisma as never);

  await assert.rejects(
    () =>
      service.addMember("workspace-1", "admin-1", {
        email: "admin-2@example.test",
        role: WorkspaceRole.ADMIN
      }),
    ForbiddenException
  );
});

test("WorkspacesService updates member role when policy allows it", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-owner",
        userId: "owner-1",
        role: WorkspaceRole.OWNER
      }),
      findFirst: mockAsync({
        id: "member-1",
        userId: "user-2",
        role: WorkspaceRole.VIEWER
      }),
      update: mockAsync({
        id: "member-1",
        role: WorkspaceRole.MEMBER
      })
    }
  };
  const service = new WorkspacesService(prisma as never);

  const result = await service.updateMemberRole(
    "workspace-1",
    "member-1",
    "owner-1",
    WorkspaceRole.MEMBER
  );

  assert.deepEqual(result, {
    id: "member-1",
    role: WorkspaceRole.MEMBER
  });
  assert.equal(prisma.workspaceMember.update.calls[0]?.[0].data.role, WorkspaceRole.MEMBER);
});

test("WorkspacesService rejects admins changing another admin role", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-admin-1",
        userId: "admin-1",
        role: WorkspaceRole.ADMIN
      }),
      findFirst: mockAsync({
        id: "member-admin-2",
        userId: "admin-2",
        role: WorkspaceRole.ADMIN
      })
    }
  };
  const service = new WorkspacesService(prisma as never);

  await assert.rejects(
    () =>
      service.updateMemberRole(
        "workspace-1",
        "member-admin-2",
        "admin-1",
        WorkspaceRole.MEMBER
      ),
    ForbiddenException
  );
});

test("WorkspacesService removes a member when policy allows it", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-owner",
        userId: "owner-1",
        role: WorkspaceRole.OWNER
      }),
      findFirst: mockAsync({
        id: "member-1",
        userId: "user-2",
        role: WorkspaceRole.MEMBER
      }),
      delete: mockAsync({})
    }
  };
  const service = new WorkspacesService(prisma as never);

  const result = await service.removeMember("workspace-1", "member-1", "owner-1");

  assert.deepEqual(result, { removed: true });
  assert.equal(prisma.workspaceMember.delete.calls[0]?.[0].where.id, "member-1");
});

test("WorkspacesService rejects removing owner members", async () => {
  const prisma = {
    workspaceMember: {
      findUnique: mockAsync({
        id: "member-owner-1",
        userId: "owner-1",
        role: WorkspaceRole.OWNER
      }),
      findFirst: mockAsync({
        id: "member-owner-2",
        userId: "owner-2",
        role: WorkspaceRole.OWNER
      })
    }
  };
  const service = new WorkspacesService(prisma as never);

  await assert.rejects(
    () => service.removeMember("workspace-1", "member-owner-2", "owner-1"),
    ForbiddenException
  );
});

function mockAsync<T>(value: T) {
  const calls: any[][] = [];
  const fn = async (...args: any[]) => {
    calls.push(args);
    return value;
  };

  return Object.assign(fn, { calls });
}
