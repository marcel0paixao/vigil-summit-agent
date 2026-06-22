import type { WorkflowNodeType } from "@flowpilot/contracts";

import { aiPromptActionNode } from "./ai-prompt-action";
import { conditionActionNode } from "./condition-action";
import { httpRequestActionNode } from "./http-request-action";
import { manualTriggerNode } from "./manual-trigger";
import { transformActionNode } from "./transform-action";

export const NODE_LIBRARY = [
  manualTriggerNode,
  transformActionNode,
  conditionActionNode,
  httpRequestActionNode,
  aiPromptActionNode
] as const;

export function getNodeCatalogEntry(type: WorkflowNodeType | string) {
  return NODE_LIBRARY.find((node) => node.type === type);
}
