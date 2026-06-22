import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

export class CreateWorkspaceDto {
  @ApiProperty({ example: "Acme Automation" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "acme-automation" })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must use lowercase letters, numbers, and single hyphens"
  })
  slug!: string;

  @ApiProperty({ example: "owner@acme.test", required: false })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiProperty({ example: "Acme Owner", required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerDisplayName?: string;
}
