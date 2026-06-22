import { ApiProperty } from "@nestjs/swagger";
import { WorkflowStatus } from "@prisma/client/index";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { z } from "zod";

export const updateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: "slug must use lowercase letters, numbers, and single hyphens"
      })
      .optional(),
    description: z.string().max(500).nullable().optional(),
    status: z.enum(WorkflowStatus).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one workflow metadata field is required"
  });

export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

export class UpdateWorkflowDto {
  @ApiProperty({ example: "Lead Enrichment", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ example: "lead-enrichment", required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must use lowercase letters, numbers, and single hyphens"
  })
  slug?: string;

  @ApiProperty({ example: "Enriches inbound leads with AI and CRM data.", nullable: true, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ enum: WorkflowStatus, example: WorkflowStatus.DRAFT, required: false })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;
}
