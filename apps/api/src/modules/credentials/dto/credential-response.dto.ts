import { ApiProperty } from "@nestjs/swagger";

export class CredentialResponseDto {
  @ApiProperty({ type: String, example: "credential-id" })
  id!: string;

  @ApiProperty({ type: String, example: "workspace-id" })
  workspaceId!: string;

  @ApiProperty({ type: String, example: "Personal OpenRouter key" })
  name!: string;

  @ApiProperty({ type: String, example: "openrouter" })
  type!: string;

  @ApiProperty({ type: String, example: "llm" })
  kind!: string;

  @ApiProperty({ type: [String], example: ["llm.chat", "llm.structured_output"] })
  capabilities!: string[];

  @ApiProperty({ type: Date, example: "2026-05-26T12:00:00.000Z", nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: Date, example: "2026-05-26T12:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ type: Date, example: "2026-05-26T12:00:00.000Z" })
  updatedAt!: Date;
}
