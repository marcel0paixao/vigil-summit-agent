import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { Bot } from "lucide-react";

import { createNodeId } from "./shared";
import type { WorkflowNodeCatalogEntry } from "./types";

export const aiPromptActionNode: WorkflowNodeCatalogEntry = {
  type: WORKFLOW_NODE_TYPES.aiPromptAction,
  title: "AI prompt",
  description: "Calls the AI orchestration boundary with a prompt.",
  runtimeDescription: "Runs an AI prompt through the configured orchestration provider.",
  icon: Bot,
  create: (nodeNumber, definition) => ({
    id: createNodeId(WORKFLOW_NODE_TYPES.aiPromptAction, definition),
    type: WORKFLOW_NODE_TYPES.aiPromptAction,
    name: `AI Prompt ${nodeNumber}`,
    config: {
      provider: "deterministic",
      model: "mock-flowpilot-llm",
      systemPrompt: "You are a concise workflow assistant.",
      prompt: "Summarize the current workflow payload for an operator.",
      temperature: 0.2
    }
  })
};
