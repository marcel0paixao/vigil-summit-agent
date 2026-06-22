from pydantic import BaseModel, ConfigDict, Field


class PromptRunContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(alias="workspaceId")
    workflow_id: str = Field(alias="workflowId")
    execution_id: str = Field(alias="executionId")
    node_execution_id: str | None = Field(default=None, alias="nodeExecutionId")
    node_id: str = Field(alias="nodeId")
    correlation_id: str = Field(alias="correlationId")


class PromptRunConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=2000)
    system_prompt: str | None = Field(
        default=None,
        alias="systemPrompt",
        min_length=1,
        max_length=2000,
    )
    provider: str = Field(default="deterministic", min_length=1, max_length=80)
    credential_id: str | None = Field(
        default=None,
        alias="credentialId",
        min_length=1,
        max_length=120,
    )
    model: str = Field(default="mock-flowpilot-llm", min_length=1, max_length=120)
    temperature: float = Field(default=0.2, ge=0, le=2)


class PromptRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    context: PromptRunContext
    config: PromptRunConfig
    input: dict[str, object]


class TokenUsage(BaseModel):
    input: int
    output: int


class PromptTrace(BaseModel):
    deterministic: bool
    input_keys: list[str] = Field(alias="inputKeys")
    provider_latency_ms: int | None = Field(default=None, alias="providerLatencyMs")
    finish_reason: str | None = Field(default=None, alias="finishReason")


class PromptRunResult(BaseModel):
    provider: str
    model: str
    prompt: str
    temperature: float
    summary: str
    tokens: TokenUsage
    trace: PromptTrace


class PromptRunResponse(BaseModel):
    result: PromptRunResult
