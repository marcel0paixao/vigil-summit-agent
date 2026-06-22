import { ApiProperty } from "@nestjs/swagger";

import { WorkflowExecutionEventResponseDto } from "./workflow-execution-event-response.dto.js";
import { WorkflowExecutionResponseDto } from "./workflow-execution-response.dto.js";
import { WorkflowAiTraceResponseDto } from "./workflow-ai-trace-response.dto.js";
import { WorkflowNodeExecutionResponseDto } from "./workflow-node-execution-response.dto.js";

export class WorkflowExecutionSummaryResponseDto {
  @ApiProperty({ type: () => WorkflowExecutionResponseDto })
  execution!: WorkflowExecutionResponseDto;

  @ApiProperty({ type: () => WorkflowNodeExecutionResponseDto, isArray: true })
  nodes!: WorkflowNodeExecutionResponseDto[];

  @ApiProperty({ type: () => WorkflowExecutionEventResponseDto, isArray: true })
  events!: WorkflowExecutionEventResponseDto[];

  @ApiProperty({ type: () => WorkflowAiTraceResponseDto, isArray: true })
  aiTraces!: WorkflowAiTraceResponseDto[];
}
