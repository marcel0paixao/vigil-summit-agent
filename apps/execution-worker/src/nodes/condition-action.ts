import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import type { WorkflowNodeExecutionContext, WorkflowNodeExecutor } from "./types.js";

type ConditionActionNode = Extract<WorkflowNode, { type: typeof WORKFLOW_NODE_TYPES.conditionAction }>;

export const executeConditionActionNode: WorkflowNodeExecutor<ConditionActionNode> = (
  node,
  context: WorkflowNodeExecutionContext
) => {
  const actualValue = getValueByPath(context.input, node.config.field);
  const matched = evaluateCondition(actualValue, node.config.operator, node.config.value);

  return {
    ...context.input,
    condition: {
      field: node.config.field,
      operator: node.config.operator,
      expected: node.config.value ?? null,
      actual: actualValue ?? null,
      matched,
      route: matched ? node.config.trueLabel : node.config.falseLabel
    }
  };
};

function getValueByPath(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((currentValue, segment) => {
    if (!isRecord(currentValue)) {
      return undefined;
    }

    return currentValue[segment];
  }, input);
}

function evaluateCondition(
  actualValue: unknown,
  operator: string,
  expectedValue: string | number | boolean | undefined
): boolean {
  if (operator === "exists") {
    return actualValue !== undefined && actualValue !== null && actualValue !== "";
  }

  if (operator === "equals") {
    return String(actualValue) === String(expectedValue);
  }

  if (operator === "notEquals") {
    return String(actualValue) !== String(expectedValue);
  }

  if (operator === "contains") {
    return String(actualValue ?? "").includes(String(expectedValue ?? ""));
  }

  if (operator === "greaterThan") {
    return Number(actualValue) > Number(expectedValue);
  }

  if (operator === "lessThan") {
    return Number(actualValue) < Number(expectedValue);
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
