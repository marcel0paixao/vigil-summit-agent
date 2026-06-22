import { ApiProperty } from "@nestjs/swagger";
import { WorkflowStatus } from "@prisma/client/index";
import type { WorkflowDefinition } from "@flowpilot/contracts";

export class WorkflowVersionResponseDto {
  @ApiProperty({ type: String, example: "version-id" })
  id!: string;

  @ApiProperty({ type: Number, example: 1 })
  version!: number;

  @ApiProperty({
    type: Object,
    example: {
      nodes: [
        {
          id: "manual-trigger",
          type: "trigger.manual",
          name: "Manual Trigger",
          config: {}
        }
      ],
      edges: []
    }
  })
  definition!: WorkflowDefinition;

  @ApiProperty({ type: Date, example: "2026-05-01T12:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ type: Date, example: "2026-05-01T12:00:00.000Z" })
  updatedAt!: Date;
}

export class WorkflowResponseDto {
  @ApiProperty({ type: String, example: "workflow-id" })
  id!: string;

  @ApiProperty({ type: String, example: "workspace-id" })
  workspaceId!: string;

  @ApiProperty({ type: String, example: "Lead Enrichment" })
  name!: string;

  @ApiProperty({ type: String, example: "lead-enrichment" })
  slug!: string;

  @ApiProperty({
    type: String,
    example: "Enriches inbound leads with AI and CRM data.",
    nullable: true
  })
  description!: string | null;

  @ApiProperty({ enum: WorkflowStatus, example: WorkflowStatus.DRAFT })
  status!: WorkflowStatus;

  @ApiProperty({ type: () => WorkflowVersionResponseDto })
  currentVersion!: WorkflowVersionResponseDto;

  @ApiProperty({ type: Date, example: "2026-05-01T12:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ type: Date, example: "2026-05-01T12:00:00.000Z" })
  updatedAt!: Date;
}
