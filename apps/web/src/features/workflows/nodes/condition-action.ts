import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { GitBranch } from "lucide-react";

import { createNodeId } from "./shared";
import type { WorkflowNodeCatalogEntry } from "./types";

export const conditionActionNode: WorkflowNodeCatalogEntry = {
  type: WORKFLOW_NODE_TYPES.conditionAction,
  title: "Condition",
  description: "Evaluates a rule and records a route decision in the payload.",
  runtimeDescription: "Evaluates a rule and adds the matched route decision to the payload.",
  icon: GitBranch,
  create: (nodeNumber, definition) => ({
    id: createNodeId(WORKFLOW_NODE_TYPES.conditionAction, definition),
    type: WORKFLOW_NODE_TYPES.conditionAction,
    name: `Condition ${nodeNumber}`,
    config: {
      field: "priority",
      operator: "equals",
      value: "high",
      trueLabel: "high_priority",
      falseLabel: "standard_priority"
    }
  })
};
