import { ApiProperty } from "@nestjs/swagger";
import { WorkflowNodeExecutionStatus } from "@prisma/client/index";

export class WorkflowNodeExecutionResponseDto {
  @ApiProperty({ example: "e3d6902c-befd-4a49-b7e8-02fae11a6292", type: String })
  id!: string;

  @ApiProperty({ example: "5197de4a-7a9a-4795-b455-e4ab877aba9b", type: String })
  workspaceId!: string;

  @ApiProperty({ example: "4455a365-b111-43f6-be2e-d613905d331c", type: String })
  workflowId!: string;

  @ApiProperty({ example: "a367abaa-b8be-4213-8ab1-e63206ff583d", type: String })
  executionId!: string;

  @ApiProperty({ example: "normalize-lead", type: String })
  nodeId!: string;

  @ApiProperty({ example: "action.transform", type: String })
  nodeType!: string;

  @ApiProperty({ enum: WorkflowNodeExecutionStatus, example: WorkflowNodeExecutionStatus.PENDING })
  status!: WorkflowNodeExecutionStatus;

  @ApiProperty({ example: { leadId: "lead-1", email: "lead@example.test" }, type: Object })
  input!: unknown;

  @ApiProperty({ example: null, nullable: true, type: Object })
  output!: unknown | null;

  @ApiProperty({ example: null, nullable: true, type: Object })
  error!: unknown | null;

  @ApiProperty({ example: null, nullable: true, type: Date })
  startedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true, type: Date })
  completedAt!: Date | null;

  @ApiProperty({ example: "2026-05-04T19:15:00.000Z", type: Date })
  createdAt!: Date;

  @ApiProperty({ example: "2026-05-04T19:15:00.000Z", type: Date })
  updatedAt!: Date;
}
