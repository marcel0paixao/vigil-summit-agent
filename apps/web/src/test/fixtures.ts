import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";

import type { CurrentUser, Workflow, WorkflowExecution, Workspace } from "@/shared/api/types";

export const demoUser: CurrentUser = {
  id: "user-owner",
  email: "owner@acme.test",
  displayName: "Acme Owner",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  memberships: [
    {
      role: "OWNER",
      workspace: {
        id: "workspace-acme",
        name: "Acme Operations",
        slug: "acme-operations",
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z"
      }
    }
  ]
};

export const demoWorkspace: Workspace = {
  id: "workspace-acme",
  name: "Acme Operations",
  slug: "acme-operations",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  members: [
    {
      id: "membership-owner",
      role: "OWNER",
      createdAt: "2026-04-01T10:00:00.000Z",
      updatedAt: "2026-04-01T10:00:00.000Z",
      user: demoUser
    }
  ]
};

export const demoWorkflow: Workflow = {
  id: "workflow-leads",
  workspaceId: demoWorkspace.id,
  name: "Lead Enrichment",
  slug: "lead-enrichment",
  description: "Normalize and enrich inbound leads.",
  status: "DRAFT",
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  currentVersion: {
    id: "workflow-version-1",
    version: 1,
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
    definition: {
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
            mode: "passthrough"
          }
        }
      ],
      edges: [
        {
          id: "manual-trigger-to-normalize-lead",
          sourceNodeId: "manual-trigger",
          targetNodeId: "normalize-lead"
        }
      ]
    }
  }
};

export const demoExecution: WorkflowExecution = {
  id: "execution-1",
  workspaceId: demoWorkspace.id,
  workflowId: demoWorkflow.id,
  workflowVersionId: demoWorkflow.currentVersion.id,
  requestedByUserId: demoUser.id,
  status: "PENDING",
  input: {
    leadId: "lead_123"
  },
  output: null,
  error: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-04-01T10:05:00.000Z",
  updatedAt: "2026-04-01T10:05:00.000Z"
};

export const demoWorkflowVersion1 = demoWorkflow.currentVersion;

export const demoWorkflowVersion2 = {
  ...demoWorkflow.currentVersion,
  id: "workflow-version-2",
  version: 2,
  createdAt: "2026-04-01T10:10:00.000Z",
  updatedAt: "2026-04-01T10:10:00.000Z"
};
