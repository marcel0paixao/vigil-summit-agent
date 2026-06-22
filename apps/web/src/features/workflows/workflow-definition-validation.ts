import { WORKFLOW_NODE_TYPES, workflowDefinitionSchema, type WorkflowDefinition } from "@flowpilot/contracts";

export function getWorkflowDefinitionIssueMessages(definition: WorkflowDefinition) {
  const validation = workflowDefinitionSchema.safeParse(definition);

  if (validation.success) {
    return [];
  }

  return Array.from(new Set(validation.error.issues.map((issue) => issue.message)));
}

export function validateWorkflowDefinition(definition: WorkflowDefinition) {
  const validation = workflowDefinitionSchema.safeParse(definition);

  if (!validation.success) {
    return {
      success: false as const,
      messages: Array.from(new Set(validation.error.issues.map((issue) => issue.message)))
    };
  }

  return {
    success: true as const,
    definition: validation.data
  };
}

export function getNodeDefinitionIssueMessages(definition: WorkflowDefinition, nodeId: string) {
  const nodeIndex = definition.nodes.findIndex((node) => node.id === nodeId);

  if (nodeIndex === -1) {
    return [];
  }

  const validation = workflowDefinitionSchema.safeParse(definition);

  if (validation.success) {
    return [];
  }

  return Array.from(
    new Set(
      validation.error.issues
        .filter((issue) => issue.path[0] === "nodes" && issue.path[1] === nodeIndex)
        .map((issue) => issue.message)
    )
  );
}

export function validateEdgeDraft({
  definition,
  sourceNodeId,
  targetNodeId,
  ignoredEdgeId
}: {
  definition: WorkflowDefinition;
  sourceNodeId: string;
  targetNodeId: string;
  ignoredEdgeId?: string;
}) {
  if (!sourceNodeId || !targetNodeId) {
    return "Choose a source and target node before adding an edge.";
  }

  if (sourceNodeId === targetNodeId) {
    return "Source and target nodes must be different.";
  }

  const sourceNode = definition.nodes.find((node) => node.id === sourceNodeId);
  const targetNode = definition.nodes.find((node) => node.id === targetNodeId);

  if (!sourceNode || !targetNode) {
    return "Source and target nodes must exist in this workflow.";
  }

  if (targetNode.type === WORKFLOW_NODE_TYPES.manualTrigger) {
    return "Manual trigger nodes cannot receive incoming edges.";
  }

  const duplicateEdge = definition.edges.some(
    (edge) =>
      edge.id !== ignoredEdgeId && edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
  );

  if (duplicateEdge) {
    return "This edge already exists.";
  }

  const nextDefinition = {
    ...definition,
    edges: [
      ...definition.edges.filter((edge) => edge.id !== ignoredEdgeId),
      {
        id: "validation-edge",
        sourceNodeId,
        targetNodeId
      }
    ]
  };
  const issueMessages = getWorkflowDefinitionIssueMessages(nextDefinition);

  return issueMessages[0];
}
