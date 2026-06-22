import { z } from "zod";

import { WORKFLOW_HTTP_METHODS, WORKFLOW_NODE_TYPES, workflowNodeBaseSchema } from "./shared.js";

export const httpRequestActionNodeSchema = workflowNodeBaseSchema
  .extend({
    type: z.literal(WORKFLOW_NODE_TYPES.httpRequestAction),
    config: z
      .object({
        mode: z.enum(["mock", "real"]).default("mock"),
        method: z.enum(WORKFLOW_HTTP_METHODS),
        url: z.string().url(),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.record(z.string(), z.unknown()).optional(),
        timeoutMs: z.number().int().min(100).max(30_000).default(5_000)
      })
      .strict()
  })
  .strict();

export type HttpRequestActionNode = z.infer<typeof httpRequestActionNodeSchema>;
