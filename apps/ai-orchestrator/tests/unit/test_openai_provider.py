import httpx
import pytest
from openai import APIStatusError, APITimeoutError

from flowpilot_ai_orchestrator.clients.credentials import CredentialSecret
from flowpilot_ai_orchestrator.providers.base import ProviderConfigurationError
from flowpilot_ai_orchestrator.providers.openai.provider import (
    OpenAiProvider,
    OpenAiProviderError,
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
            type="openai",
            kind="llm",
            capabilities=["llm.chat"],
            value="sk-openai",
        )


class FakeOpenAiResponse:
    def __init__(self, body: dict[str, object] | list[object] | None = None) -> None:
        self.body = body if body is not None else {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "content": "OpenAI summary",
                    },
                },
            ],
            "usage": {
                "prompt_tokens": 11,
                "completion_tokens": 6,
            },
        }

    def model_dump(self, *, mode: str) -> dict[str, object] | list[object]:
        assert mode == "json"
        return self.body


def test_openai_provider_builds_request_and_returns_prompt_result() -> None:
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(
            self,
            *,
            model: str,
            messages: list[dict[str, str]],
            temperature: float,
        ) -> FakeOpenAiResponse:
            captured["model"] = model
            captured["messages"] = messages
            captured["temperature"] = temperature
            return FakeOpenAiResponse()

    class FakeOpenAIClient:
        def __init__(self, *, api_key: str) -> None:
            captured["api_key"] = api_key
            self.chat = type("FakeChat", (), {"completions": FakeCompletions()})()

    def fake_client_factory(api_key: str, timeout_seconds: float) -> FakeOpenAIClient:
        captured["timeout_seconds"] = timeout_seconds
        return FakeOpenAIClient(api_key=api_key)

    credential_client = FakeCredentialClient()

    result = OpenAiProvider(
        credential_client=credential_client,
        client_factory=fake_client_factory,
        timeout_seconds=12.5,
    ).run(
        context=make_context(),
        config=PromptRunConfig(
            prompt="Summarize this lead.",
            provider="openai",
            credentialId="credential-1",
            model="gpt-4o-mini",
            temperature=0.2,
        ),
        input_data={"leadId": "lead-1"},
    )

    assert credential_client.calls == [("workspace-1", "credential-1")]
    assert captured == {
        "api_key": "sk-openai",
        "timeout_seconds": 12.5,
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "messages": [
            {
                "role": "user",
                "content": 'Summarize this lead.\n\nInput:\n{"leadId": "lead-1"}',
            },
        ],
    }
    assert result.provider == "openai"
    assert result.summary == "OpenAI summary"
    assert result.tokens.input == 11
    assert result.tokens.output == 6
    assert result.trace.deterministic is False
    assert result.trace.finish_reason == "stop"
    assert result.trace.provider_latency_ms is not None


def test_openai_provider_requires_credential_id() -> None:
    credential_client = FakeCredentialClient()

    with pytest.raises(ProviderConfigurationError, match="requires credentialId"):
        OpenAiProvider(credential_client=credential_client).run(
            context=make_context(),
            config=PromptRunConfig(
                prompt="Summarize this lead.",
                provider="openai",
                model="gpt-4o-mini",
                temperature=0.2,
            ),
            input_data={"leadId": "lead-1"},
        )

    assert credential_client.calls == []


def test_openai_provider_maps_timeout_errors(
) -> None:
    class FakeCompletions:
        def create(self, **_: object) -> FakeOpenAiResponse:
            raise APITimeoutError(request=httpx.Request("POST", "https://api.openai.com"))

    class FakeOpenAIClient:
        def __init__(self, *, api_key: str) -> None:
            self.chat = type("FakeChat", (), {"completions": FakeCompletions()})()

    with pytest.raises(OpenAiProviderError, match="timed out"):
        OpenAiProvider(
            credential_client=FakeCredentialClient(),
            client_factory=lambda api_key, timeout_seconds: FakeOpenAIClient(api_key=api_key),
        ).run(
            context=make_context(),
            config=make_openai_config(),
            input_data={"leadId": "lead-1"},
        )


def test_openai_provider_maps_status_errors(
) -> None:
    provider_error = {
        "error": {
            "message": "You exceeded your current quota",
        },
    }

    class FakeCompletions:
        def create(self, **_: object) -> FakeOpenAiResponse:
            request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
            response = httpx.Response(429, json=provider_error, request=request)
            raise APIStatusError("OpenAI quota exceeded", response=response, body=provider_error)

    class FakeOpenAIClient:
        def __init__(self, *, api_key: str) -> None:
            self.chat = type("FakeChat", (), {"completions": FakeCompletions()})()

    with pytest.raises(OpenAiProviderError, match="status 429") as error:
        OpenAiProvider(
            credential_client=FakeCredentialClient(),
            client_factory=lambda api_key, timeout_seconds: FakeOpenAIClient(api_key=api_key),
        ).run(
            context=make_context(),
            config=make_openai_config(),
            input_data={"leadId": "lead-1"},
        )

    assert error.value.status_code == 429
    assert error.value.provider_error == provider_error


def test_openai_provider_rejects_invalid_response(
) -> None:
    class FakeCompletions:
        def create(self, **_: object) -> FakeOpenAiResponse:
            return FakeOpenAiResponse(body=[])

    class FakeOpenAIClient:
        def __init__(self, *, api_key: str) -> None:
            self.chat = type("FakeChat", (), {"completions": FakeCompletions()})()

    with pytest.raises(OpenAiProviderError, match="invalid response"):
        OpenAiProvider(
            credential_client=FakeCredentialClient(),
            client_factory=lambda api_key, timeout_seconds: FakeOpenAIClient(api_key=api_key),
        ).run(
            context=make_context(),
            config=make_openai_config(),
            input_data={"leadId": "lead-1"},
        )


def make_openai_config() -> PromptRunConfig:
    return PromptRunConfig(
        prompt="Summarize this lead.",
        provider="openai",
        credentialId="credential-1",
        model="gpt-4o-mini",
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
