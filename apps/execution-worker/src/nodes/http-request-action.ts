import { WORKFLOW_NODE_TYPES, type WorkflowNode } from "@flowpilot/contracts";

import { WorkflowExecutionWorkerError } from "../errors.js";
import type { WorkflowNodeExecutionContext, WorkflowNodeExecutor } from "./types.js";

type HttpRequestActionNode = Extract<
  WorkflowNode,
  { type: typeof WORKFLOW_NODE_TYPES.httpRequestAction }
>;

export const executeHttpRequestActionNode: WorkflowNodeExecutor<HttpRequestActionNode> = async (
  node,
  context: WorkflowNodeExecutionContext
) => {
  if (node.config.mode === "real") {
    return await executeRealHttpRequestNode(node, context.input);
  }

  return {
    status: "mocked",
    request: {
      mode: node.config.mode ?? "mock",
      method: node.config.method,
      url: node.config.url,
      headers: node.config.headers ?? {},
      body: {
        ...(node.config.body ?? {}),
        input: context.input
      }
    },
    response: {
      statusCode: 200,
      body: {
        ok: true,
        echoedInput: context.input
      }
    }
  };
};

async function executeRealHttpRequestNode(
  node: HttpRequestActionNode,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body = {
    ...(node.config.body ?? {}),
    input
  };
  const method = node.config.method;
  const headers = {
    "content-type": "application/json",
    ...(node.config.headers ?? {})
  };
  const startedAt = Date.now();

  try {
    const response = await fetch(node.config.url, {
      body: method === "GET" ? undefined : JSON.stringify(body),
      headers,
      method,
      signal: AbortSignal.timeout(node.config.timeoutMs ?? 5_000)
    });
    const responseText = await response.text();

    return {
      status: response.ok ? "ok" : "http_error",
      request: {
        mode: "real",
        method,
        url: node.config.url,
        headers,
        body: method === "GET" ? null : body
      },
      response: {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: parseHttpResponseBody(responseText),
        durationMs: Date.now() - startedAt
      }
    };
  } catch (error) {
    throw new WorkflowExecutionWorkerError(
      "http_request_failed",
      error instanceof Error ? error.message : "HTTP request failed",
      true,
      { cause: error }
    );
  }
}

function parseHttpResponseBody(value: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
