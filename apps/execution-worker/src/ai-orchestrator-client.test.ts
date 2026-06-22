import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  AiOrchestratorClient,
  AiOrchestratorClientError
} from "./ai-orchestrator-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("AI orchestrator client posts prompt run requests and returns result payloads", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init });
    return Response.json({
      result: {
        provider: "flowpilot-mock-ai",
        trace: {
          inputKeys: ["email", "leadId"]
        }
      }
    });
  }) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const result = await client.runPrompt({
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    executionId: "execution-1",
    nodeExecutionId: "node-execution-ai-summary",
    nodeId: "ai-summary",
    correlationId: "workflow-execution:execution-1",
    input: {
      leadId: "lead-1",
      email: "lead@example.test"
    },
    systemPrompt: "You summarize CRM leads.",
    prompt: "Summarize this lead.",
    provider: "deterministic",
    credentialId: "credential-1",
    model: "mock-flowpilot-llm",
    temperature: 0.2
  });

  assert.deepEqual(result, {
    provider: "flowpilot-mock-ai",
    trace: {
      inputKeys: ["email", "leadId"]
    }
  });
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.input), "http://ai-orchestrator:8000/v1/prompts/run");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(requests[0]?.init?.headers, {
    "content-type": "application/json"
  });
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    context: {
      workspaceId: "workspace-1",
      workflowId: "workflow-1",
      executionId: "execution-1",
      nodeExecutionId: "node-execution-ai-summary",
      nodeId: "ai-summary",
      correlationId: "workflow-execution:execution-1"
    },
    config: {
      prompt: "Summarize this lead.",
      systemPrompt: "You summarize CRM leads.",
      provider: "deterministic",
      credentialId: "credential-1",
      model: "mock-flowpilot-llm",
      temperature: 0.2
    },
    input: {
      leadId: "lead-1",
      email: "lead@example.test"
    }
  });
});

test("AI orchestrator client rejects non-successful responses", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: "unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/json"
      }
    })) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_orchestrator_http_503");
  assert.equal(error.statusCode, 503);
  assert.equal(error.retryable, true);
  assert.equal(error.message, "unavailable");
});

test("AI orchestrator client maps semantic validation errors as non-retryable", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      {
        detail: {
          code: "unknown_ai_provider",
          message: "Unknown AI provider: unknown",
          provider: "unknown"
        }
      },
      {
        status: 422
      }
    )) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "unknown_ai_provider");
  assert.equal(error.statusCode, 422);
  assert.equal(error.retryable, false);
  assert.equal(error.message, "Unknown AI provider: unknown");
});

test("AI orchestrator client maps provider configuration errors as non-retryable", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      {
        detail: {
          code: "ai_provider_configuration_error",
          message: "OpenRouter provider requires credentialId",
          provider: "openrouter"
        }
      },
      {
        status: 422
      }
    )) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_provider_configuration_error");
  assert.equal(error.statusCode, 422);
  assert.equal(error.retryable, false);
  assert.equal(error.message, "OpenRouter provider requires credentialId");
});

test("AI orchestrator client treats provider rate limits as non-retryable", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      {
        detail: {
          code: "ai_provider_error",
          provider: "openrouter",
          status: 429,
          message: "OpenRouter request failed with status 429",
          providerError: {
            error: {
              message: "Provider is temporarily rate-limited upstream"
            }
          }
        }
      },
      {
        status: 502
      }
    )) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_provider_error");
  assert.equal(error.statusCode, 502);
  assert.equal(error.retryable, false);
  assert.equal(error.message, "OpenRouter request failed with status 429");
});

test("AI orchestrator client preserves OpenAI provider quota errors", async () => {
  globalThis.fetch = (async () =>
    Response.json(
      {
        detail: {
          code: "ai_provider_error",
          provider: "openai",
          status: 429,
          message: "OpenAi request failed with status 429",
          providerError: {
            error: {
              message: "You exceeded your current quota"
            }
          }
        }
      },
      {
        status: 502
      }
    )) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_provider_error");
  assert.equal(error.statusCode, 502);
  assert.equal(error.retryable, false);
  assert.equal(error.message, "OpenAi request failed with status 429");
  assert.deepEqual(error.responseBody, {
    detail: {
      code: "ai_provider_error",
      provider: "openai",
      status: 429,
      message: "OpenAi request failed with status 429",
      providerError: {
        error: {
          message: "You exceeded your current quota"
        }
      }
    }
  });
});

test("AI orchestrator client rejects responses without result objects", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      status: "ok"
    })) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000");

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_orchestrator_malformed_response");
  assert.equal(error.retryable, true);
});

test("AI orchestrator client treats request timeouts as retryable", async () => {
  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    })) as typeof fetch;

  const client = new AiOrchestratorClient("http://ai-orchestrator:8000", 1);

  const error = await captureAiOrchestratorError(() => client.runPrompt(validPromptInput()));

  assert.equal(error.code, "ai_orchestrator_timeout");
  assert.equal(error.retryable, true);
});

function validPromptInput() {
  return {
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    executionId: "execution-1",
    nodeExecutionId: "node-execution-ai-summary",
    nodeId: "ai-summary",
    correlationId: "workflow-execution:execution-1",
    input: {
      leadId: "lead-1"
    },
    prompt: "Summarize this lead.",
    provider: "deterministic",
    model: "mock-flowpilot-llm",
    temperature: 0.2
  };
}

async function captureAiOrchestratorError(
  action: () => Promise<unknown>
): Promise<AiOrchestratorClientError> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof AiOrchestratorClientError);
    return error;
  }

  assert.fail("Expected AI orchestrator client error");
}
