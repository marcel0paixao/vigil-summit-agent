import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import type { WorkflowNodeExecutionContext, WorkflowNodeExecutor } from "./types.js";

type ManualTriggerNode = Extract<WorkflowNode, { type: typeof WORKFLOW_NODE_TYPES.manualTrigger }>;

export const executeManualTriggerNode: WorkflowNodeExecutor<ManualTriggerNode> = (
  _node,
  context: WorkflowNodeExecutionContext
) => context.input;
