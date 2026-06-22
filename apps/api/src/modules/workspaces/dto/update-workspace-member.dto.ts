import { ApiProperty } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";
import { IsEnum } from "class-validator";

export class UpdateWorkspaceMemberDto {
  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
