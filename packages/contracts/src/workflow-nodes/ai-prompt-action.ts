import { z } from "zod";

import { WORKFLOW_NODE_TYPES, workflowNodeBaseSchema } from "./shared.js";

export const aiPromptActionNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal(WORKFLOW_NODE_TYPES.aiPromptAction),
    config: z
      .object({
        prompt: z.string().min(1).max(2_000),
        systemPrompt: z.string().min(1).max(2_000).optional(),
        provider: z.string().min(1).max(80).default("deterministic"),
        credentialId: z.string().min(1).max(120).optional(),
        model: z.string().min(1).max(120).default("mock-flowpilot-llm"),
        temperature: z.number().min(0).max(2).default(0.2)
      })
      .strict()
  })
  .strict();

export type AiPromptActionNode = z.infer<typeof aiPromptActionNodeSchema>;
