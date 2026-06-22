import { z } from "zod";

import { aiPromptActionNodeSchema } from "./ai-prompt-action.js";
import { conditionActionNodeSchema } from "./condition-action.js";
import { httpRequestActionNodeSchema } from "./http-request-action.js";
import { manualTriggerNodeSchema } from "./manual-trigger.js";
import { transformActionNodeSchema } from "./transform-action.js";

export * from "./ai-prompt-action.js";
export * from "./condition-action.js";
export * from "./http-request-action.js";
export * from "./manual-trigger.js";
export * from "./shared.js";
export * from "./transform-action.js";

export const workflowNodeSchema = z.discriminatedUnion("type", [
  manualTriggerNodeSchema,
  transformActionNodeSchema,
  conditionActionNodeSchema,
  httpRequestActionNodeSchema,
  aiPromptActionNodeSchema
]);

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
