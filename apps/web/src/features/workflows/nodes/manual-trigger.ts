import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { MousePointerClick } from "lucide-react";

import { createNodeId } from "./shared";
import type { WorkflowNodeCatalogEntry } from "./types";

export const manualTriggerNode: WorkflowNodeCatalogEntry = {
  type: WORKFLOW_NODE_TYPES.manualTrigger,
  title: "Manual trigger",
  description: "Starts a workflow run from user-provided input.",
  runtimeDescription: "Starts the execution with the input supplied by the user.",
  icon: MousePointerClick,
  create: (nodeNumber, definition) => ({
    id: createNodeId(WORKFLOW_NODE_TYPES.manualTrigger, definition),
    type: WORKFLOW_NODE_TYPES.manualTrigger,
    name: `Manual Trigger ${nodeNumber}`,
    config: {}
  })
};
