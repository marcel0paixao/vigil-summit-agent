import { ApiProperty } from "@nestjs/swagger";

const aiTraceStatuses = ["SUCCEEDED", "FAILED"] as const;

type AiTraceStatus = (typeof aiTraceStatuses)[number];

export class WorkflowAiTraceResponseDto {
  @ApiProperty({ example: "7c8d1320-2b11-4c0e-99da-87bf4243196a", type: String })
  id!: string;

  @ApiProperty({ example: "5197de4a-7a9a-4795-b455-e4ab877aba9b", type: String })
  workspaceId!: string;

  @ApiProperty({ example: "4455a365-b111-43f6-be2e-d613905d331c", nullable: true, type: String })
  workflowId!: string | null;

  @ApiProperty({ example: "a367abaa-b8be-4213-8ab1-e63206ff583d", nullable: true, type: String })
  workflowExecutionId!: string | null;

  @ApiProperty({ example: "e3d6902c-befd-4a49-b7e8-02fae11a6292", nullable: true, type: String })
  nodeExecutionId!: string | null;

  @ApiProperty({ example: "ai-summary", nullable: true, type: String })
  nodeId!: string | null;

  @ApiProperty({ example: "2672b3e7-6535-44f6-824d-660c34a8519d", nullable: true, type: String })
  credentialId!: string | null;

  @ApiProperty({ example: "openrouter", type: String })
  provider!: string;

  @ApiProperty({ example: "openai/gpt-oss-20b:free", type: String })
  model!: string;

  @ApiProperty({ enum: aiTraceStatuses, example: "SUCCEEDED" })
  status!: AiTraceStatus;

  @ApiProperty({ example: 1240, type: Number })
  latencyMs!: number;

  @ApiProperty({ example: 1180, nullable: true, type: Number })
  providerLatencyMs!: number | null;

  @ApiProperty({ example: "stop", nullable: true, type: String })
  finishReason!: string | null;

  @ApiProperty({ example: 87, type: Number })
  inputTokenCount!: number;

  @ApiProperty({ example: 42, type: Number })
  outputTokenCount!: number;

  @ApiProperty({ example: 129, type: Number })
  totalTokenCount!: number;

  @ApiProperty({ example: null, nullable: true, type: String })
  estimatedCostUsd!: string | null;

  @ApiProperty({ example: 310, nullable: true, type: Number })
  inputSizeBytes!: number | null;

  @ApiProperty({ example: 512, nullable: true, type: Number })
  outputSizeBytes!: number | null;

  @ApiProperty({ example: true, nullable: true, type: Boolean })
  schemaValid!: boolean | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  errorCode!: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  errorMessage!: string | null;

  @ApiProperty({ example: null, nullable: true, type: Number })
  providerStatusCode!: number | null;

  @ApiProperty({ example: null, nullable: true, type: Boolean })
  retryable!: boolean | null;

  @ApiProperty({ example: "2026-05-28T17:00:00.000Z", type: Date })
  createdAt!: Date;
}
