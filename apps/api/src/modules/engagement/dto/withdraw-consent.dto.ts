import { CommunicationChannel, ConsentPurpose } from "@prisma/client/index";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class WithdrawConsentDto {
  @IsOptional() @IsEnum(ConsentPurpose) purpose?: ConsentPurpose;
  @IsOptional() @IsEnum(CommunicationChannel) channel?: CommunicationChannel;
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
}
