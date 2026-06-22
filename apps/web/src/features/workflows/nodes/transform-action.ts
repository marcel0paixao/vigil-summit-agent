import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { Braces } from "lucide-react";

import { createNodeId } from "./shared";
import type { WorkflowNodeCatalogEntry } from "./types";

export const transformActionNode: WorkflowNodeCatalogEntry = {
  type: WORKFLOW_NODE_TYPES.transformAction,
  title: "Transform",
  description: "Passes data through or picks fields from the payload.",
  runtimeDescription: "Transforms the current payload before the next node runs.",
  icon: Braces,
  create: (nodeNumber, definition) => ({
    id: createNodeId(WORKFLOW_NODE_TYPES.transformAction, definition),
    type: WORKFLOW_NODE_TYPES.transformAction,
    name: `Transform ${nodeNumber}`,
    config: {
      mode: "passthrough"
    }
  })
};
