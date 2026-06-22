import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client/index";
import { compare, hash } from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: Pick<JwtService, "signAsync">
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const passwordHash = await hash(dto.password, 12);

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          passwordHash: true
        }
      });

      if (existingUser?.passwordHash) {
        throw new ConflictException("User email already exists");
      }

      const user = existingUser
        ? await this.prisma.user.update({
            where: { id: existingUser.id },
            data: {
              displayName: dto.displayName,
              passwordHash
            },
            select: userSelect
          })
        : await this.prisma.user.create({
            data: {
              email,
              displayName: dto.displayName,
              passwordHash
            },
            select: userSelect
          });

      return { user };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("User email already exists");
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: dto.workspaceId ? { workspaceId: dto.workspaceId } : undefined,
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isValidPassword = await compare(dto.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const membership = user.memberships[0];

    if (dto.workspaceId && !membership) {
      throw new ForbiddenException("User is not a member of this workspace");
    }

    const payload = {
      sub: user.id,
      email: user.email,
      workspaceId: membership?.workspaceId,
      role: membership?.role
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      workspace: membership
        ? {
            id: membership.workspaceId,
            role: membership.role
          }
        : null
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userSelect,
        memberships: {
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                updatedAt: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return { user };
  }
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;
