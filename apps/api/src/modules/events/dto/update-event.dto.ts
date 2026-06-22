import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from "class-validator";

export class UpdateEventDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1_000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() audienceProfile?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() agenda?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() companionEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10) maxCompanions?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(3_650) retentionDays?: number;
}
