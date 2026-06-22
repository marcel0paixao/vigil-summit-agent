import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import type { WorkflowNodeExecutionContext, WorkflowNodeExecutor } from "./types.js";

type TransformActionNode = Extract<WorkflowNode, { type: typeof WORKFLOW_NODE_TYPES.transformAction }>;

export const executeTransformActionNode: WorkflowNodeExecutor<TransformActionNode> = (
  node,
  context: WorkflowNodeExecutionContext
) => {
  if (node.config.mode === "passthrough") {
    return context.input;
  }

  const pickedKeys = node.config.pick ?? [];

  return Object.fromEntries(
    pickedKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(context.input, key))
      .map((key) => [key, context.input[key]])
  );
};
