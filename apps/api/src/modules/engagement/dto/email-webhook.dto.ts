import { MessageEventType } from "@prisma/client/index";
import { IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class EmailWebhookDto {
  @IsString() @IsNotEmpty() @MaxLength(240) eventId!: string;
  @IsString() @IsNotEmpty() @MaxLength(240) providerMessageId!: string;
  @IsEnum(MessageEventType) type!: MessageEventType;
  @IsDateString({ strict: true }) occurredAt!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
