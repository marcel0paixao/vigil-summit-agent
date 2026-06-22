import httpx
import pytest

from flowpilot_ai_orchestrator.clients.credentials import CredentialSecret
from flowpilot_ai_orchestrator.providers.base import ProviderConfigurationError
from flowpilot_ai_orchestrator.providers.openrouter.provider import (
    OpenRouterProvider,
    OpenRouterProviderError,
)
from flowpilot_ai_orchestrator.schemas import PromptRunConfig, PromptRunContext


class FakeCredentialClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def get_secret(self, workspace_id: str, credential_id: str) -> CredentialSecret:
        self.calls.append((workspace_id, credential_id))
        return CredentialSecret(
            id=credential_id,
            workspaceId=workspace_id,
            type="openrouter",
            kind="llm",
            capabilities=["llm.chat"],
            value="sk-openrouter",
        )


class FakeResponse:
    def __init__(
        self,
        *,
        body: dict[str, object] | list[object] | None = None,
        status_code: int = 200,
    ) -> None:
        self.body = body if body is not None else {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "content": "OpenRouter summary",
                    },
                },
            ],
            "usage": {
                "prompt_tokens": 7,
                "completion_tokens": 5,
            },
        }
        self.status_code = status_code

    def json(self) -> dict[str, object] | list[object]:
        return self.body

    def raise_for_status(self) -> None:
        if self.status_code < 400:
            return

        request = httpx.Request(
            "POST", "https://openrouter.ai/api/v1/chat/completions"
        )
        response = httpx.Response(self.status_code, json=self.body, request=request)
        raise httpx.HTTPStatusError("OpenRouter error", request=request, response=response)


def test_openrouter_provider_builds_request_and_returns_prompt_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeResponse:
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    credential_client = FakeCredentialClient()
    monkeypatch.setattr(httpx, "post", fake_post)

    result = OpenRouterProvider(credential_client=credential_client).run(
        context=make_context(),
        config=PromptRunConfig(
            prompt="Summarize this lead.",
            provider="openrouter",
            credentialId="credential-1",
            model="openai/gpt-oss-20b:free",
            temperature=0.2,
        ),
        input_data={"leadId": "lead-1"},
    )

    assert credential_client.calls == [("workspace-1", "credential-1")]
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"] == {"Authorization": "Bearer sk-openrouter"}
    assert captured["timeout"] == 30
    assert captured["json"] == {
        "model": "openai/gpt-oss-20b:free",
        "temperature": 0.2,
        "messages": [
            {
                "role": "user",
                "content": 'Summarize this lead.\n\nInput:\n{"leadId": "lead-1"}',
            },
        ],
    }
    assert result.provider == "openrouter"
    assert result.summary == "OpenRouter summary"
    assert result.tokens.input == 7
    assert result.tokens.output == 5
    assert result.trace.deterministic is False
    assert result.trace.finish_reason == "stop"
    assert result.trace.provider_latency_ms is not None


def test_openrouter_provider_requires_credential_id() -> None:
    credential_client = FakeCredentialClient()

    with pytest.raises(ProviderConfigurationError, match="requires credentialId"):
        OpenRouterProvider(credential_client=credential_client).run(
            context=make_context(),
            config=PromptRunConfig(
                prompt="Summarize this lead.",
                provider="openrouter",
                model="openai/gpt-oss-20b:free",
                temperature=0.2,
            ),
            input_data={"leadId": "lead-1"},
        )

    assert credential_client.calls == []


def test_openrouter_provider_maps_timeout_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeResponse:
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(OpenRouterProviderError, match="timed out"):
        OpenRouterProvider(credential_client=FakeCredentialClient()).run(
            context=make_context(),
            config=make_openrouter_config(),
            input_data={"leadId": "lead-1"},
        )


def test_openrouter_provider_maps_status_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeResponse:
        return FakeResponse(status_code=429)

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(OpenRouterProviderError, match="status 429") as error:
        OpenRouterProvider(credential_client=FakeCredentialClient()).run(
            context=make_context(),
            config=make_openrouter_config(),
            input_data={"leadId": "lead-1"},
        )

    assert error.value.status_code == 429
    assert error.value.provider_error == {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": "OpenRouter summary",
                },
            },
        ],
        "usage": {
            "prompt_tokens": 7,
            "completion_tokens": 5,
        },
    }


def test_openrouter_provider_rejects_invalid_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeResponse:
        return FakeResponse(body=[])

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(OpenRouterProviderError, match="invalid response"):
        OpenRouterProvider(credential_client=FakeCredentialClient()).run(
            context=make_context(),
            config=make_openrouter_config(),
            input_data={"leadId": "lead-1"},
        )


def make_openrouter_config() -> PromptRunConfig:
    return PromptRunConfig(
        prompt="Summarize this lead.",
        provider="openrouter",
        credentialId="credential-1",
        model="openai/gpt-oss-20b:free",
        temperature=0.2,
    )


def make_context() -> PromptRunContext:
    return PromptRunContext(
        workspaceId="workspace-1",
        workflowId="workflow-1",
        executionId="execution-1",
        nodeExecutionId="node-execution-1",
        nodeId="ai-summary",
        correlationId="correlation-1",
    )
