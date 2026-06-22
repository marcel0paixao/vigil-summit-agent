import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class LeadsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(workspaceId: string, eventId?: string) {
    return this.prisma.lead.findMany({
      where: {
        workspaceId,
        ...(eventId ? { registrations: { some: { eventId } } } : {})
      },
      select: {
        id: true,
        fullName: true,
        workEmail: true,
        jobTitle: true,
        companyName: true,
        companyDomain: true,
        suppressedAt: true,
        createdAt: true,
        registrations: {
          where: eventId ? { eventId } : undefined,
          select: {
            id: true,
            eventId: true,
            status: true,
            registeredAt: true,
            qualification: {
              select: { status: true, score: true, reasonCodes: true, policyVersion: true }
            }
          },
          orderBy: { registeredAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async findOne(workspaceId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: {
        registrations: {
          include: { event: true, qualification: true },
          orderBy: { registeredAt: "desc" }
        },
        consentRecords: { orderBy: { grantedAt: "desc" } },
        enrichmentSnapshots: { orderBy: { createdAt: "desc" } },
        interestSignals: { orderBy: { occurredAt: "desc" } },
        qualifications: { orderBy: { evaluatedAt: "desc" } },
        conversations: { include: { messages: { orderBy: { createdAt: "asc" } } } },
        agentDecisions: { orderBy: { createdAt: "desc" } },
        meetings: { orderBy: { createdAt: "desc" } },
        suppressions: { where: { active: true } }
      }
    });

    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }
}
