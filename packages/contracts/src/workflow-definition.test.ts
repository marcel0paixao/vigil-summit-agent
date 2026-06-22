import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_WORKFLOW_DEFINITION,
  WORKFLOW_NODE_TYPES,
  workflowDefinitionSchema
} from "./index.js";

test("default workflow definition is executable from a manual trigger", () => {
  const result = workflowDefinitionSchema.safeParse(DEFAULT_WORKFLOW_DEFINITION);

  assert.equal(result.success, true);
});

test("workflow definition accepts the initial demo node types", () => {
  const result = workflowDefinitionSchema.safeParse({
    nodes: [
      {
        id: "manual-trigger",
        type: WORKFLOW_NODE_TYPES.manualTrigger,
        name: "Manual Trigger",
        config: {}
      },
      {
        id: "normalize-lead",
        type: WORKFLOW_NODE_TYPES.transformAction,
        name: "Normalize Lead",
        config: {
          mode: "pick",
          pick: ["leadId", "email"]
        }
      },
      {
        id: "enrichment-request",
        type: WORKFLOW_NODE_TYPES.httpRequestAction,
        name: "Request Enrichment",
        config: {
          mode: "mock",
          method: "POST",
          url: "https://example.com/api/enrich-lead",
          headers: {
            "content-type": "application/json"
          },
          body: {
            source: "flowpilot-demo"
          }
        }
      },
      {
        id: "priority-check",
        type: WORKFLOW_NODE_TYPES.conditionAction,
        name: "Check Priority",
        config: {
          field: "priority",
          operator: "equals",
          value: "high",
          trueLabel: "high_priority",
          falseLabel: "standard_priority"
        }
      },
      {
        id: "ai-summary",
        type: WORKFLOW_NODE_TYPES.aiPromptAction,
        name: "Summarize Lead",
        config: {
          prompt: "Summarize this lead for an operator."
        }
      }
    ],
    edges: [
      {
        id: "edge-manual-to-normalize",
        sourceNodeId: "manual-trigger",
        targetNodeId: "normalize-lead"
      },
      {
        id: "edge-normalize-to-enrichment",
        sourceNodeId: "normalize-lead",
        targetNodeId: "enrichment-request"
      },
      {
        id: "edge-enrichment-to-summary",
        sourceNodeId: "enrichment-request",
        targetNodeId: "priority-check"
      },
      {
        id: "edge-priority-to-summary",
        sourceNodeId: "priority-check",
        targetNodeId: "ai-summary"
      }
    ]
  });

  assert.equal(result.success, true);
});

test("workflow definition rejects condition operators that require a missing value", () => {
  const result = workflowDefinitionSchema.safeParse({
    nodes: [
      {
        id: "manual-trigger",
        type: WORKFLOW_NODE_TYPES.manualTrigger,
        name: "Manual Trigger",
        config: {}
      },
      {
        id: "priority-check",
        type: WORKFLOW_NODE_TYPES.conditionAction,
        name: "Check Priority",
        config: {
          field: "priority",
          operator: "equals"
        }
      }
    ],
    edges: [
      {
        id: "edge-manual-to-condition",
        sourceNodeId: "manual-trigger",
        targetNodeId: "priority-check"
      }
    ]
  });

  assert.equal(result.success, false);
});

test("workflow definition accepts optional node canvas positions", () => {
  const result = workflowDefinitionSchema.safeParse({
    nodes: [
      {
        id: "manual-trigger",
        type: WORKFLOW_NODE_TYPES.manualTrigger,
        name: "Manual Trigger",
        position: { x: 120, y: 80 },
        config: {}
      }
    ],
    edges: []
  });

  assert.equal(result.success, true);
});

test("workflow definition rejects broken edges and unreachable nodes", () => {
  const result = workflowDefinitionSchema.safeParse({
    nodes: [
      {
        id: "manual-trigger",
        type: WORKFLOW_NODE_TYPES.manualTrigger,
        name: "Manual Trigger",
        config: {}
      },
      {
        id: "orphan-transform",
        type: WORKFLOW_NODE_TYPES.transformAction,
        name: "Orphan Transform",
        config: {
          mode: "passthrough"
        }
      }
    ],
    edges: [
      {
        id: "edge-to-missing-node",
        sourceNodeId: "manual-trigger",
        targetNodeId: "missing-node"
      }
    ]
  });

  assert.equal(result.success, false);
});
