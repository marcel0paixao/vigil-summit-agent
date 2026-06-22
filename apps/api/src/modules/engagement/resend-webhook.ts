import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { MessageEventType } from "@prisma/client/index";
import { Webhook } from "svix";

import {
  type EmailWebhookDto,
  type NormalizedEmailWebhook,
  type ResendEmailEventType
} from "./dto/email-webhook.dto.js";

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

const eventTypeMap: Record<ResendEmailEventType, MessageEventType> = {
  "email.sent": MessageEventType.SENT,
  "email.delivered": MessageEventType.DELIVERED,
  "email.opened": MessageEventType.OPENED,
  "email.clicked": MessageEventType.CLICKED,
  "email.bounced": MessageEventType.BOUNCED,
  "email.complained": MessageEventType.COMPLAINED
};

export function verifyResendWebhook(
  rawBody: Buffer | undefined,
  headers: ResendWebhookHeaders,
  secret: string
): void {
  if (!rawBody || !headers.id || !headers.timestamp || !headers.signature) {
    throw new UnauthorizedException("Resend webhook signature headers are required");
  }

  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": headers.id,
      "svix-timestamp": headers.timestamp,
      "svix-signature": headers.signature
    });
  } catch {
    throw new UnauthorizedException("Resend webhook signature is invalid");
  }
}

export function normalizeResendEmailWebhook(
  dto: EmailWebhookDto,
  providerEventId: string
): NormalizedEmailWebhook {
  if (!dto.data || typeof dto.data.email_id !== "string" || dto.data.email_id.length === 0) {
    throw new BadRequestException("Resend webhook data.email_id is required");
  }

  return {
    eventId: providerEventId,
    providerMessageId: dto.data.email_id,
    type: eventTypeMap[dto.type],
    occurredAt: dto.created_at,
    metadata: {
      resendEventType: dto.type,
      ...dto.data
    }
  };
}
