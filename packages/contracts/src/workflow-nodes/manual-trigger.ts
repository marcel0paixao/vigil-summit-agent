import { z } from "zod";

import { WORKFLOW_NODE_TYPES, workflowNodeBaseSchema } from "./shared.js";

export const manualTriggerNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal(WORKFLOW_NODE_TYPES.manualTrigger),
    config: z.object({}).strict()
  })
  .strict();

export type ManualTriggerNode = z.infer<typeof manualTriggerNodeSchema>;
