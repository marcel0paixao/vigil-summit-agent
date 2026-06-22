import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { appConfig } from "../config/app.config.js";
import { PrismaService } from "../prisma/prisma.service.js";

const windowMs = 15 * 60_000;
const requestLimit = 10;

@Injectable()
export class PublicRegistrationProtectionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(eventId: string, ip: string, honeypot?: string) {
    if (honeypot?.trim()) {
      return { blockedAsBot: true, response: { created: true, registrationId: randomUUID(), leadId: randomUUID(), status: "REGISTERED" as const } };
    }
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const keyHash = createHash("sha256").update(`${appConfig.webhookSigningSecret}:${eventId}:${ip}`).digest("hex");
    const bucket = await this.prisma.publicRateLimit.upsert({ where: { keyHash_windowStart: { keyHash, windowStart } }, create: { keyHash, windowStart }, update: { count: { increment: 1 } } });
    if (bucket.count > requestLimit) throw new HttpException("Too many registration attempts", HttpStatus.TOO_MANY_REQUESTS);
    if (Math.random() < 0.01) await this.prisma.publicRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 2 * windowMs) } } });
    return { blockedAsBot: false as const };
  }
}
