import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from "class-validator";

export class RegisterForEventDto {
  @ApiProperty({ required: false, description: "Honeypot field. Must remain empty." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiProperty({ example: "Mariana Costa" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: "mariana@fintech.example" })
  @IsEmail()
  @MaxLength(254)
  workEmail!: string;

  @ApiProperty({ example: "CISO", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiProperty({ example: "Fintech Example" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  companyName!: string;

  @ApiProperty({ example: "fintech.example", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: "companyDomain must be a valid domain" })
  companyDomain?: string;

  @ApiProperty({ example: ["SOC 2", "AI risk"], required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  interestTopics?: string[];

  @ApiProperty({ example: "2026-06-20" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  privacyNoticeVersion!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: "eventCommunicationConsent must be accepted" })
  eventCommunicationConsent!: boolean;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  commercialFollowUpConsent?: boolean;
}
