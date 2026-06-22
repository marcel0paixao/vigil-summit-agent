import type { WorkflowExecutionRequestedMessage, WorkflowNode } from "@flowpilot/contracts";

import type { AiOrchestratorClient } from "../ai-orchestrator-client.js";

export type WorkflowNodeExecutionContext = {
  aiOrchestratorClient: AiOrchestratorClient;
  input: Record<string, unknown>;
  message: WorkflowExecutionRequestedMessage;
  nodeExecutionId: string;
};

export type WorkflowNodeExecutor<TNode extends WorkflowNode> = (
  node: TNode,
  context: WorkflowNodeExecutionContext
) => Promise<Record<string, unknown>> | Record<string, unknown>;
