import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, WorkspaceRole } from "@prisma/client/index";

import { PrismaService } from "../prisma/prisma.service.js";
import { AddWorkspaceMemberDto } from "./dto/add-workspace-member.dto.js";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto.js";

@Injectable()
export class WorkspacesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkspaceDto, ownerUserId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            members: {
              create: {
                userId: ownerUserId,
                role: WorkspaceRole.OWNER
              }
            }
          },
          include: workspaceInclude
        });

        return workspace;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Workspace slug already exists");
      }

      throw error;
    }
  }

  findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId
          }
        }
      },
      orderBy: { createdAt: "desc" },
      include: workspaceInclude
    });
  }

  async findOne(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: workspaceInclude
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return workspace;
  }

  async findMembers(workspaceId: string) {
    await this.ensureWorkspaceExists(workspaceId);

    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      ...memberListQuery
    });
  }

  async addMember(workspaceId: string, actorUserId: string, dto: AddWorkspaceMemberDto) {
    const actor = await this.getActorMembership(workspaceId, actorUserId);
    const role = dto.role ?? WorkspaceRole.MEMBER;

    this.assertCanAssignRole(actor.role, role);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email: dto.email.toLowerCase() },
          create: {
            email: dto.email.toLowerCase(),
            displayName: dto.displayName ?? dto.email
          },
          update: dto.displayName
            ? {
                displayName: dto.displayName
              }
            : {}
        });

        return tx.workspaceMember.create({
          data: {
            workspaceId,
            userId: user.id,
            role
          },
          select: memberSelect
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("User is already a member of this workspace");
      }

      throw error;
    }
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    actorUserId: string,
    nextRole: WorkspaceRole
  ) {
    const actor = await this.getActorMembership(workspaceId, actorUserId);
    const member = await this.getMember(workspaceId, memberId);

    this.assertCanUpdateMember(actor, member, nextRole);

    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: nextRole },
      select: memberSelect
    });
  }

  async removeMember(workspaceId: string, memberId: string, actorUserId: string) {
    const actor = await this.getActorMembership(workspaceId, actorUserId);
    const member = await this.getMember(workspaceId, memberId);

    this.assertCanRemoveMember(actor, member);

    await this.prisma.workspaceMember.delete({
      where: { id: memberId }
    });

    return { removed: true };
  }

  private async ensureWorkspaceExists(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
  }

  private async getActorMembership(workspaceId: string, actorUserId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: actorUserId
        }
      },
      select: {
        id: true,
        userId: true,
        role: true
      }
    });

    if (!membership) {
      throw new ForbiddenException("Workspace membership is required");
    }

    return membership;
  }

  private async getMember(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId
      },
      select: {
        id: true,
        userId: true,
        role: true
      }
    });

    if (!member) {
      throw new NotFoundException("Workspace member not found");
    }

    return member;
  }

  private assertCanAssignRole(actorRole: WorkspaceRole, nextRole: WorkspaceRole) {
    if (nextRole === WorkspaceRole.OWNER) {
      throw new ForbiddenException("Owner role cannot be assigned through member management");
    }

    if (actorRole === WorkspaceRole.ADMIN && nextRole === WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Admins cannot assign admin role");
    }
  }

  private assertCanUpdateMember(
    actor: MembershipPolicySubject,
    member: MembershipPolicySubject,
    nextRole: WorkspaceRole
  ) {
    if (member.role === WorkspaceRole.OWNER || nextRole === WorkspaceRole.OWNER) {
      throw new ForbiddenException("Owner role cannot be changed through member management");
    }

    if (actor.id === member.id) {
      throw new ForbiddenException("Members cannot change their own role");
    }

    if (actor.role === WorkspaceRole.ADMIN) {
      if (member.role === WorkspaceRole.ADMIN || nextRole === WorkspaceRole.ADMIN) {
        throw new ForbiddenException("Admins can only manage member and viewer roles");
      }
    }
  }

  private assertCanRemoveMember(
    actor: MembershipPolicySubject,
    member: MembershipPolicySubject
  ) {
    if (member.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException("Owner members cannot be removed through member management");
    }

    if (actor.id === member.id) {
      throw new ForbiddenException("Members cannot remove themselves");
    }

    if (actor.role === WorkspaceRole.ADMIN && member.role === WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Admins cannot remove admin members");
    }
  }
}

const workspaceInclude = {
  members: {
    select: {
      id: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.WorkspaceInclude;

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true
    }
  }
} satisfies Prisma.WorkspaceMemberSelect;

const memberListQuery = {
  select: memberSelect,
  orderBy: {
    createdAt: "asc"
  }
} satisfies Prisma.WorkspaceMemberFindManyArgs;

interface MembershipPolicySubject {
  id: string;
  userId: string;
  role: WorkspaceRole;
}
