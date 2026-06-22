import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import { WorkflowExecutionWorkerError } from "../errors.js";
import { executeAiPromptActionNode } from "./ai-prompt-action.js";
import { executeConditionActionNode } from "./condition-action.js";
import { executeHttpRequestActionNode } from "./http-request-action.js";
import { executeManualTriggerNode } from "./manual-trigger.js";
import { executeTransformActionNode } from "./transform-action.js";
import type { WorkflowNodeExecutionContext } from "./types.js";

export type { WorkflowNodeExecutionContext } from "./types.js";

export async function executeWorkflowNode(
  node: WorkflowNode,
  context: WorkflowNodeExecutionContext
): Promise<Record<string, unknown>> {
  if (node.type === WORKFLOW_NODE_TYPES.manualTrigger) {
    return executeManualTriggerNode(node, context);
  }

  if (node.type === WORKFLOW_NODE_TYPES.transformAction) {
    return executeTransformActionNode(node, context);
  }

  if (node.type === WORKFLOW_NODE_TYPES.conditionAction) {
    return executeConditionActionNode(node, context);
  }

  if (node.type === WORKFLOW_NODE_TYPES.aiPromptAction) {
    return await executeAiPromptActionNode(node, context);
  }

  if (node.type === WORKFLOW_NODE_TYPES.httpRequestAction) {
    return await executeHttpRequestActionNode(node, context);
  }

  throw new WorkflowExecutionWorkerError(
    "unsupported_workflow_node",
    `Unsupported workflow node type: ${(node as { type?: string }).type ?? "unknown"}`,
    false
  );
}
