import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class RecordInboundMessageDto {
  @IsString() @IsNotEmpty() registrationId!: string;
  @IsString() @IsNotEmpty() @MaxLength(10_000) body!: string;
  @IsOptional() @IsString() @MaxLength(240) providerMessageId?: string;
}
