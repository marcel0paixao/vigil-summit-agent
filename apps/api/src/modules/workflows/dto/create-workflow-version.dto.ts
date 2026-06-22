import { ApiProperty } from "@nestjs/swagger";
import { workflowDefinitionSchema, type WorkflowDefinition } from "@flowpilot/contracts";
import { IsObject } from "class-validator";
import { z } from "zod";

export const createWorkflowVersionSchema = z
  .object({
    definition: workflowDefinitionSchema
  })
  .strict();

export type CreateWorkflowVersionInput = z.infer<typeof createWorkflowVersionSchema>;

export class CreateWorkflowVersionDto {
  @ApiProperty({
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
  @IsObject()
  definition!: WorkflowDefinition;
}
