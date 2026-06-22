import { z } from "zod";

import { WORKFLOW_NODE_TYPES, workflowNodeBaseSchema } from "./shared.js";

export const transformActionNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal(WORKFLOW_NODE_TYPES.transformAction),
    config: z
      .object({
        mode: z.enum(["passthrough", "pick"]),
        pick: z.array(z.string().min(1).max(120)).min(1).max(50).optional()
      })
      .strict()
      .superRefine((config, context) => {
        if (config.mode === "pick" && !config.pick) {
          context.addIssue({
            code: "custom",
            message: "pick mode requires a non-empty pick list",
            path: ["pick"]
          });
        }
      })
  })
  .strict();

export type TransformActionNode = z.infer<typeof transformActionNodeSchema>;
