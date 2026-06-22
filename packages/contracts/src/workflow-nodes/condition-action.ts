import { z } from "zod";

import {
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_NODE_TYPES,
  workflowNodeBaseSchema
} from "./shared.js";

export const conditionActionNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal(WORKFLOW_NODE_TYPES.conditionAction),
    config: z
      .object({
        field: z.string().min(1).max(120),
        operator: z.enum(WORKFLOW_CONDITION_OPERATORS),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
        trueLabel: z.string().min(1).max(80).default("matched"),
        falseLabel: z.string().min(1).max(80).default("not_matched")
      })
      .strict()
      .superRefine((config, context) => {
        if (config.operator !== "exists" && config.value === undefined) {
          context.addIssue({
            code: "custom",
            message: "condition value is required for this operator",
            path: ["value"]
          });
        }
      })
  })
  .strict();

export type ConditionActionNode = z.infer<typeof conditionActionNodeSchema>;
