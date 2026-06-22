import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";
import { z } from "zod";

export const createWorkflowExecutionSchema = z
  .object({
    input: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export type CreateWorkflowExecutionInput = z.infer<typeof createWorkflowExecutionSchema>;

export class CreateWorkflowExecutionDto {
  @ApiProperty({
    example: {
      leadId: "lead_123",
      email: "lead@example.test"
    },
    required: false,
    type: Object
  })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
