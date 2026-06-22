import { z } from "zod";

export const WORKFLOW_NODE_TYPES = {
  manualTrigger: "trigger.manual",
  transformAction: "action.transform",
  conditionAction: "action.condition",
  httpRequestAction: "action.httpRequest",
  aiPromptAction: "action.aiPrompt"
} as const;

export const WORKFLOW_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const WORKFLOW_CONDITION_OPERATORS = [
  "exists",
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan"
] as const;

export const workflowNodeIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
    message:
      "node ids must start with a letter or number and use letters, numbers, dots, colons, underscores, or hyphens"
  });

export const workflowNodeNameSchema = z.string().min(1).max(120);

export const workflowNodeBaseSchema = z.object({
  id: workflowNodeIdSchema,
  name: workflowNodeNameSchema,
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite()
    })
    .strict()
    .optional()
});

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[keyof typeof WORKFLOW_NODE_TYPES];
export type WorkflowHttpMethod = (typeof WORKFLOW_HTTP_METHODS)[number];
export type WorkflowConditionOperator = (typeof WORKFLOW_CONDITION_OPERATORS)[number];
