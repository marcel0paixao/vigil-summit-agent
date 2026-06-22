import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "owner@acme.test" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "correct horse battery staple" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: "5197de4a-7a9a-4795-b455-e4ab877aba9b" })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
