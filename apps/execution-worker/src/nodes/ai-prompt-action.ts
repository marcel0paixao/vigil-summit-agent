import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import type { WorkflowNodeExecutionContext, WorkflowNodeExecutor } from "./types.js";

type AiPromptActionNode = Extract<WorkflowNode, { type: typeof WORKFLOW_NODE_TYPES.aiPromptAction }>;

export const executeAiPromptActionNode: WorkflowNodeExecutor<AiPromptActionNode> = async (
  node,
  context: WorkflowNodeExecutionContext
) =>
  await context.aiOrchestratorClient.runPrompt({
    workspaceId: context.message.workspaceId,
    workflowId: context.message.payload.workflowId,
    executionId: context.message.payload.executionId,
    nodeExecutionId: context.nodeExecutionId,
    nodeId: node.id,
    correlationId: context.message.correlationId,
    input: context.input,
    provider: node.config.provider,
    credentialId: node.config.credentialId,
    model: node.config.model,
    systemPrompt: node.config.systemPrompt,
    prompt: node.config.prompt,
    temperature: node.config.temperature
  });
