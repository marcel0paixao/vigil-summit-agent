export type AiPromptRunInput = {
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeExecutionId: string;
  nodeId: string;
  correlationId: string;
  input: Record<string, unknown>;
  prompt: string;
  systemPrompt?: string;
  provider: string;
  credentialId?: string;
  model: string;
  temperature: number;
};

export type AiPromptRunResult = Record<string, unknown>;

export class AiOrchestratorClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AiOrchestratorClientError";
  }
}

export class AiOrchestratorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000
  ) {}

  async runPrompt(request: AiPromptRunInput): Promise<AiPromptRunResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/prompts/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(createPromptRunPayload(request)),
        signal: controller.signal
      });

      if (!response.ok) {
        const responseBody = await readResponseBody(response);
        const providerError = parseProviderError(responseBody);

        throw new AiOrchestratorClientError(
          providerError.code ?? `ai_orchestrator_http_${response.status}`,
          providerError.message ?? `AI orchestrator request failed with status ${response.status}`,
          isRetryableAiOrchestratorFailure(response.status, providerError),
          response.status,
          responseBody
        );
      }

      const data: unknown = await readResponseBody(response);

      if (!isRecord(data) || !isRecord(data.result)) {
        throw new AiOrchestratorClientError(
          "ai_orchestrator_malformed_response",
          "AI orchestrator response did not include a result object",
          true,
          response.status,
          data
        );
      }

      return data.result;
    } catch (error) {
      if (error instanceof AiOrchestratorClientError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new AiOrchestratorClientError(
          "ai_orchestrator_timeout",
          `AI orchestrator request timed out after ${this.timeoutMs}ms`,
          true,
          undefined,
          undefined,
          { cause: error }
        );
      }

      throw new AiOrchestratorClientError(
        "ai_orchestrator_unavailable",
        error instanceof Error ? error.message : "AI orchestrator request failed",
        true,
        undefined,
        undefined,
        { cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createPromptRunPayload(request: AiPromptRunInput) {
  return {
    context: {
      workspaceId: request.workspaceId,
      workflowId: request.workflowId,
      executionId: request.executionId,
      nodeExecutionId: request.nodeExecutionId,
      nodeId: request.nodeId,
      correlationId: request.correlationId
    },
    config: {
      prompt: request.prompt,
      ...(request.systemPrompt !== undefined ? { systemPrompt: request.systemPrompt } : {}),
      provider: request.provider,
      ...(request.credentialId !== undefined ? { credentialId: request.credentialId } : {}),
      model: request.model,
      temperature: request.temperature
    },
    input: request.input
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new AiOrchestratorClientError(
      "ai_orchestrator_invalid_json",
      "AI orchestrator response body was not valid JSON",
      true,
      response.status,
      undefined,
      { cause: error }
    );
  }
}

type ParsedProviderError = {
  code?: string;
  message?: string;
  providerStatus?: number;
};

function parseProviderError(responseBody: unknown): ParsedProviderError {
  if (!isRecord(responseBody)) {
    return {};
  }

  const detail = responseBody.detail;

  if (typeof detail === "string") {
    return {
      message: detail
    };
  }

  if (!isRecord(detail)) {
    return {};
  }

  return {
    code: typeof detail.code === "string" ? detail.code : undefined,
    message: typeof detail.message === "string" ? detail.message : undefined,
    providerStatus: typeof detail.status === "number" ? detail.status : undefined
  };
}

function isRetryableAiOrchestratorFailure(
  statusCode: number,
  providerError: ParsedProviderError
): boolean {
  if (providerError.code === "ai_provider_error" && providerError.providerStatus === 429) {
    return false;
  }

  return isRetryableStatus(statusCode);
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
