import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { WorkspaceRole } from "@prisma/client/index";

import { PrismaService } from "../../prisma/prisma.service.js";
import {
  WORKSPACE_ROLES_KEY
} from "../decorators/workspace-roles.decorator.js";
import type { AuthenticatedRequest } from "../types/current-user.js";

@Injectable()
export class WorkspaceRolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(WORKSPACE_ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest & RequestWithParams>();
    const workspaceId = request.params.workspaceId ?? request.params.id ?? request.user.workspaceId;

    if (!workspaceId) {
      throw new ForbiddenException("Workspace context is required");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: request.user.sub
        }
      },
      select: {
        workspaceId: true,
        role: true
      }
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException("Workspace role is not allowed");
    }

    request.workspaceMembership = membership;
    return true;
  }
}

interface RequestWithParams {
  params: {
    id?: string;
    workspaceId?: string;
  };
}
