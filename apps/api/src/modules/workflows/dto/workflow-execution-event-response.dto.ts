import { ApiProperty } from "@nestjs/swagger";

export class WorkflowExecutionEventResponseDto {
  @ApiProperty({ example: "c9c0a2ed-7623-4d78-a994-1d4b637f1d41", type: String })
  id!: string;

  @ApiProperty({ example: "5197de4a-7a9a-4795-b455-e4ab877aba9b", type: String })
  workspaceId!: string;

  @ApiProperty({ example: "4455a365-b111-43f6-be2e-d613905d331c", type: String })
  workflowId!: string;

  @ApiProperty({ example: "b8d1c9e8-7b3a-4e8f-a7a1-0fb0ddc7f87d", type: String })
  executionId!: string;

  @ApiProperty({ example: "workflow.execution.completed", type: String })
  eventName!: string;

  @ApiProperty({ example: "f7f7b532-707d-4231-8efb-9f5ea4f4d0cc", type: String })
  eventId!: string;

  @ApiProperty({ example: "2026-05-04T06:35:56.200Z", type: Date })
  occurredAt!: Date;

  @ApiProperty({ example: "execution-worker", type: String })
  producer!: string;

  @ApiProperty({
    example: {
      executionId: "b8d1c9e8-7b3a-4e8f-a7a1-0fb0ddc7f87d",
      workflowId: "4455a365-b111-43f6-be2e-d613905d331c"
    },
    type: Object
  })
  payload!: unknown;

  @ApiProperty({ example: "2026-05-04T06:35:56.210Z", type: Date })
  createdAt!: Date;
}
