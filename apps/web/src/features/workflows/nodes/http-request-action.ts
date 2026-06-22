import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { Globe2 } from "lucide-react";

import { createNodeId } from "./shared";
import type { WorkflowNodeCatalogEntry } from "./types";

export const httpRequestActionNode: WorkflowNodeCatalogEntry = {
  type: WORKFLOW_NODE_TYPES.httpRequestAction,
  title: "HTTP request",
  description: "Runs a mock or real HTTP request action in the worker.",
  runtimeDescription: "Runs a mock or real HTTP request action in the worker.",
  icon: Globe2,
  create: (nodeNumber, definition) => ({
    id: createNodeId(WORKFLOW_NODE_TYPES.httpRequestAction, definition),
    type: WORKFLOW_NODE_TYPES.httpRequestAction,
    name: `HTTP Request ${nodeNumber}`,
    config: {
      mode: "mock",
      method: "GET",
      url: "https://example.test/webhook",
      body: {},
      timeoutMs: 5000
    }
  })
};
