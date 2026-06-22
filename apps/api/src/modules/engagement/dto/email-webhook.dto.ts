import { MessageEventType } from "@prisma/client/index";
import { IsDateString, IsIn, IsObject } from "class-validator";

export const resendEmailEventTypes = [
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained"
] as const;

export type ResendEmailEventType = (typeof resendEmailEventTypes)[number];

export type ResendEmailEventData = {
  email_id: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  tags?: Record<string, string>;
  bounce?: Record<string, unknown>;
  click?: Record<string, unknown>;
  [key: string]: unknown;
};

export class EmailWebhookDto {
  @IsIn([...resendEmailEventTypes]) type!: ResendEmailEventType;
  @IsDateString({ strict: true }) created_at!: string;
  @IsObject() data!: ResendEmailEventData;
}

export type NormalizedEmailWebhook = {
  eventId: string;
  providerMessageId: string;
  type: MessageEventType;
  occurredAt: string;
  metadata: Record<string, unknown>;
};
