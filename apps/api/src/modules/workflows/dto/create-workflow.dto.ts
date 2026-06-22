import { ApiProperty } from "@nestjs/swagger";
import { workflowDefinitionSchema, type WorkflowDefinition } from "@flowpilot/contracts";
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";
import { z } from "zod";

export const createWorkflowSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: "slug must use lowercase letters, numbers, and single hyphens"
      }),
    description: z.string().max(500).optional(),
    definition: workflowDefinitionSchema.optional()
  })
  .strict();

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;

export class CreateWorkflowDto {
  @ApiProperty({ example: "Lead Enrichment" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "lead-enrichment" })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must use lowercase letters, numbers, and single hyphens"
  })
  slug!: string;

  @ApiProperty({ example: "Enriches inbound leads with AI and CRM data.", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

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
    },
    required: false
  })
  @IsOptional()
  @IsObject()
  definition?: WorkflowDefinition;
}
