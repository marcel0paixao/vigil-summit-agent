import type { WorkflowDefinition, WorkflowNode, WorkflowNodeType } from "@flowpilot/contracts";
import type { LucideIcon } from "lucide-react";

export type WorkflowNodeCatalogEntry = {
  type: WorkflowNodeType;
  title: string;
  description: string;
  runtimeDescription: string;
  icon: LucideIcon;
  create: (nodeNumber: number, definition: WorkflowDefinition) => WorkflowNode;
};
