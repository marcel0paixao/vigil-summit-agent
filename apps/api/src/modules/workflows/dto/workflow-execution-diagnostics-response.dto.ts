import { ApiProperty } from "@nestjs/swagger";
import { OutboxMessageStatus } from "@prisma/client/index";

export class WorkflowExecutionRetryDiagnosticsDto {
  @ApiProperty({ type: Number, example: 3 })
  attempts!: number;

  @ApiProperty({ type: Boolean, example: true })
  deadLettered!: boolean;

  @ApiProperty({ type: String, example: "workflow_execution_worker_error", nullable: true })
  lastFailureCode!: string | null;

  @ApiProperty({ type: String, example: "Connector temporarily unavailable", nullable: true })
  lastFailureMessage!: string | null;

  @ApiProperty({ type: Boolean, example: true, nullable: true })
  retryable!: boolean | null;
}

export class WorkflowExecutionOutboxDiagnosticsDto {
  @ApiProperty({ type: String, example: "outbox-id" })
  id!: string;

  @ApiProperty({ type: String, example: "workflow.execution.completed" })
  eventName!: string;

  @ApiProperty({ enum: OutboxMessageStatus, example: OutboxMessageStatus.PUBLISHED })
  status!: OutboxMessageStatus;

  @ApiProperty({ type: Number, example: 1 })
  attempts!: number;

  @ApiProperty({ type: String, example: "flowpilot.events" })
  exchange!: string;

  @ApiProperty({ type: String, example: "workflow.execution.completed" })
  routingKey!: string;

  @ApiProperty({ type: String, nullable: true })
  lastError!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

export class WorkflowExecutionDiagnosticsResponseDto {
  @ApiProperty({ type: WorkflowExecutionRetryDiagnosticsDto })
  retry!: WorkflowExecutionRetryDiagnosticsDto;

  @ApiProperty({ type: WorkflowExecutionOutboxDiagnosticsDto, isArray: true })
  outbox!: WorkflowExecutionOutboxDiagnosticsDto[];
}
