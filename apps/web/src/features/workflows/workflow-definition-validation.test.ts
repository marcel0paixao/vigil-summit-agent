import { WORKFLOW_NODE_TYPES, type WorkflowDefinition } from "@flowpilot/contracts";

import {
  getNodeDefinitionIssueMessages,
  getWorkflowDefinitionIssueMessages,
  validateEdgeDraft
} from "./workflow-definition-validation";

const validDefinition: WorkflowDefinition = {
  nodes: [
    {
      id: "manual-trigger",
      type: WORKFLOW_NODE_TYPES.manualTrigger,
      name: "Manual Trigger",
      config: {}
    },
    {
      id: "transform",
      type: WORKFLOW_NODE_TYPES.transformAction,
      name: "Transform",
      config: {
        mode: "passthrough"
      }
    }
  ],
  edges: [
    {
      id: "manual-trigger-to-transform",
      sourceNodeId: "manual-trigger",
      targetNodeId: "transform"
    }
  ]
};

describe("workflow definition validation", () => {
  it("returns no messages for a valid workflow definition", () => {
    expect(getWorkflowDefinitionIssueMessages(validDefinition)).toEqual([]);
  });

  it("rejects duplicate edges before the user saves", () => {
    expect(
      validateEdgeDraft({
        definition: validDefinition,
        sourceNodeId: "manual-trigger",
        targetNodeId: "transform"
      })
    ).toBe("This edge already exists.");
  });

  it("rejects edges that point back into a manual trigger", () => {
    expect(
      validateEdgeDraft({
        definition: validDefinition,
        sourceNodeId: "transform",
        targetNodeId: "manual-trigger"
      })
    ).toBe("Manual trigger nodes cannot receive incoming edges.");
  });

  it("returns node-specific config messages", () => {
    const definition = {
      ...validDefinition,
      nodes: validDefinition.nodes.map((node) =>
        node.id === "transform"
          ? {
              ...node,
              config: {
                mode: "pick"
              }
            }
          : node
      )
    } as WorkflowDefinition;

    expect(getNodeDefinitionIssueMessages(definition, "transform")).toEqual([
      "pick mode requires a non-empty pick list"
    ]);
  });
});
