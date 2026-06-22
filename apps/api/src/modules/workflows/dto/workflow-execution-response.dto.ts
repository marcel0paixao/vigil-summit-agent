import { ApiProperty } from "@nestjs/swagger";

export class WorkflowExecutionResponseDto {
  @ApiProperty({ example: "b8d1c9e8-7b3a-4e8f-a7a1-0fb0ddc7f87d", type: String })
  id!: string;

  @ApiProperty({ example: "5197de4a-7a9a-4795-b455-e4ab877aba9b", type: String })
  workspaceId!: string;

  @ApiProperty({ example: "4455a365-b111-43f6-be2e-d613905d331c", type: String })
  workflowId!: string;

  @ApiProperty({ example: "94283785-c109-4e1c-a0dc-912f385a04fa", type: String })
  workflowVersionId!: string;

  @ApiProperty({ example: "7f6221c1-5dc7-418e-ae6d-950e0dd5085c", nullable: true, type: String })
  requestedByUserId!: string | null;

  @ApiProperty({ example: "PENDING", type: String })
  status!: string;

  @ApiProperty({ example: { leadId: "lead_123" }, type: Object })
  input!: unknown;

  @ApiProperty({ example: null, nullable: true, type: Object })
  output!: unknown | null;

  @ApiProperty({ example: null, nullable: true, type: Object })
  error!: unknown | null;

  @ApiProperty({ example: null, nullable: true, type: Date })
  startedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true, type: Date })
  completedAt!: Date | null;

  @ApiProperty({ example: "2026-05-01T13:30:00.000Z", type: Date })
  createdAt!: Date;

  @ApiProperty({ example: "2026-05-01T13:30:00.000Z", type: Date })
  updatedAt!: Date;
}
