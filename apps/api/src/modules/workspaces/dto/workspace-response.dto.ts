import { ApiProperty } from "@nestjs/swagger";
import { WorkspaceRole } from "@prisma/client/index";

import { UserProfileResponseDto } from "../../auth/dto/auth-response.dto.js";

export class WorkspaceMemberResponseDto {
  @ApiProperty({ type: String, example: "09254b49-7a32-48dc-bf07-cc5a80f69128" })
  id!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.OWNER })
  role!: WorkspaceRole;

  @ApiProperty({ type: Date, example: "2026-04-28T01:11:16.822Z" })
  createdAt!: Date;

  @ApiProperty({ type: Date, example: "2026-04-28T01:11:16.822Z" })
  updatedAt!: Date;

  @ApiProperty({ type: () => UserProfileResponseDto })
  user!: UserProfileResponseDto;
}

export class WorkspaceResponseDto {
  @ApiProperty({ type: String, example: "5197de4a-7a9a-4795-b455-e4ab877aba9b" })
  id!: string;

  @ApiProperty({ type: String, example: "Acme Automation" })
  name!: string;

  @ApiProperty({ type: String, example: "acme-automation" })
  slug!: string;

  @ApiProperty({ type: Date, example: "2026-04-28T01:11:16.822Z" })
  createdAt!: Date;

  @ApiProperty({ type: Date, example: "2026-04-28T01:11:16.822Z" })
  updatedAt!: Date;

  @ApiProperty({ type: () => WorkspaceMemberResponseDto, isArray: true })
  members!: WorkspaceMemberResponseDto[];
}

export class RemoveWorkspaceMemberResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  removed!: true;
}
