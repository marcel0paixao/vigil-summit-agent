import { ApiProperty } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class AddWorkspaceMemberDto {
  @ApiProperty({ example: "member@acme.test" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Acme Member", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER, required: false })
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
}
