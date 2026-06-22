import { ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class CreateEventDto {
  @ApiProperty({ example: "Vigil Summit - Seguranca para a Era da IA" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: "vigil-summit-2026" })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must use lowercase letters, numbers, and single hyphens"
  })
  slug!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiProperty({ example: "Sao Paulo, SP", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  location?: string;

  @ApiProperty({ example: "2026-09-18T09:00:00-03:00" })
  @IsDateString({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: "2026-09-18T18:00:00-03:00", required: false })
  @IsOptional()
  @IsDateString({ strict: true })
  endsAt?: string;

  @ApiProperty({ example: "America/Sao_Paulo" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  timezone!: string;

  @ApiProperty({ default: 120, minimum: 1, maximum: 10_000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  capacity!: number;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  audienceProfile?: Record<string, unknown>;
}
