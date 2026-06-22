import type { WorkflowDefinition, WorkflowNodeType } from "@flowpilot/contracts";

import { humanizeIdentifier, slugify } from "@/shared/lib/utils";

export function createNodeId(type: WorkflowNodeType, definition: WorkflowDefinition) {
  const baseId = slugify(humanizeIdentifier(type)) || "node";
  const existingIds = new Set(definition.nodes.map((node) => node.id));

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}
