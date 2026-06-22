import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from flowpilot_ai_orchestrator.clients.credentials import (
    CredentialClient,
    CredentialSecret,
)
from flowpilot_ai_orchestrator.main import app
from flowpilot_ai_orchestrator.providers.anthropic.provider import (
    AnthropicProvider,
    AnthropicProviderError,
)
from flowpilot_ai_orchestrator.providers.openai.provider import (
    OpenAiProvider,
    OpenAiProviderError,
)

fixtures_dir = Path(__file__).resolve().parents[1] / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((fixtures_dir / name).read_text(encoding="utf-8"))


def test_prompt_run_returns_deterministic_response() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/prompts/run",
        json=load_fixture("prompt_run_request.json"),
    )

    assert response.status_code == 200
    assert response.json() == load_fixture("prompt_run_response.json")


def test_prompt_run_can_use_openrouter_provider_without_real_credential(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_get_secret(
        self: CredentialClient,
        *,
        workspace_id: str,
        credential_id: str,
    ) -> CredentialSecret:
        return CredentialSecret(
            id=credential_id,
            workspaceId=workspace_id,
            type="openrouter",
            kind="llm",
            capabilities=["llm.chat"],
            value="sk-test-openrouter",
        )

    class FakeOpenRouterResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": "OpenRouter mocked response",
                        },
                    },
                ],
                "usage": {
                    "prompt_tokens": 9,
                    "completion_tokens": 4,
                },
            }

    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeOpenRouterResponse:
        assert url == "https://openrouter.ai/api/v1/chat/completions"
        assert headers == {"Authorization": "Bearer sk-test-openrouter"}
        assert json["model"] == "openai/gpt-oss-20b:free"
        assert timeout == 30
        return FakeOpenRouterResponse()

    monkeypatch.setenv("FLOWPILOT_INTERNAL_API_TOKEN", "test-internal-token")
    monkeypatch.setattr(CredentialClient, "get_secret", fake_get_secret)
    monkeypatch.setattr(httpx, "post", fake_post)

    client = TestClient(app)

    response = client.post(
        "/v1/prompts/run",
        json={
            "context": {
                "workspaceId": "workspace-1",
                "workflowId": "workflow-1",
                "executionId": "execution-1",
                "nodeExecutionId": "node-execution-1",
                "nodeId": "ai-summary",
                "correlationId": "correlation-1",
            },
            "config": {
                "prompt": "Summarize this lead.",
                "provider": "openrouter",
                "credentialId": "credential-1",
                "model": "openai/gpt-oss-20b:free",
                "temperature": 0.2,
            },
            "input": {
                "leadId": "lead-1",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["result"]["provider"] == "openrouter"
    assert response.json()["result"]["summary"] == "OpenRouter mocked response"
    assert response.json()["result"]["tokens"] == {"input": 9, "output": 4}
    assert response.json()["result"]["trace"]["finishReason"] == "stop"


def test_prompt_run_returns_bad_gateway_when_openrouter_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_get_secret(
        self: CredentialClient,
        *,
        workspace_id: str,
        credential_id: str,
    ) -> CredentialSecret:
        return CredentialSecret(
            id=credential_id,
            workspaceId=workspace_id,
            type="openrouter",
            kind="llm",
            capabilities=["llm.chat"],
            value="sk-test-openrouter",
        )

    class FakeOpenRouterResponse:
        status_code = 429

        def raise_for_status(self) -> None:
            request = httpx.Request(
                "POST", "https://openrouter.ai/api/v1/chat/completions"
            )
            response = httpx.Response(
                self.status_code,
                json={
                    "error": {
                        "message": "Rate limit exceeded",
                    },
                },
                request=request,
            )
            raise httpx.HTTPStatusError(
                "OpenRouter rate limit",
                request=request,
                response=response,
            )

    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, object],
        timeout: int,
    ) -> FakeOpenRouterResponse:
        return FakeOpenRouterResponse()

    monkeypatch.setenv("FLOWPILOT_INTERNAL_API_TOKEN", "test-internal-token")
    monkeypatch.setattr(CredentialClient, "get_secret", fake_get_secret)
    monkeypatch.setattr(httpx, "post", fake_post)

    client = TestClient(app)

    response = client.post(
        "/v1/prompts/run",
        json={
            "context": {
                "workspaceId": "workspace-1",
                "workflowId": "workflow-1",
                "executionId": "execution-1",
                "nodeExecutionId": "node-execution-1",
                "nodeId": "ai-summary",
                "correlationId": "correlation-1",
            },
            "config": {
                "prompt": "Summarize this lead.",
                "provider": "openrouter",
                "credentialId": "credential-1",
                "model": "openai/gpt-oss-20b:free",
                "temperature": 0.2,
            },
            "input": {
                "leadId": "lead-1",
            },
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == {
        "code": "ai_provider_error",
        "provider": "openrouter",
        "status": 429,
        "message": "OpenRouter request failed with status 429",
        "providerError": {
            "error": {
                "message": "Rate limit exceeded",
            },
        },
    }


def test_prompt_run_returns_bad_gateway_when_openai_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(self: OpenAiProvider, **_: object) -> None:
        raise OpenAiProviderError(
            "OpenAi request failed with status 429",
            status_code=429,
            provider_error={
                "error": {
                    "message": "You exceeded your current quota",
                },
            },
        )

    monkeypatch.setattr(OpenAiProvider, "run", fake_run)

    client = TestClient(app)

    response = client.post(
        "/v1/prompts/run",
        json={
            "context": {
                "workspaceId": "workspace-1",
                "workflowId": "workflow-1",
                "executionId": "execution-1",
                "nodeExecutionId": "node-execution-1",
                "nodeId": "ai-summary",
                "correlationId": "correlation-1",
            },
            "config": {
                "prompt": "Summarize this lead.",
                "provider": "openai",
                "credentialId": "credential-1",
                "model": "gpt-4o-mini",
                "temperature": 0.2,
            },
            "input": {
                "leadId": "lead-1",
            },
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == {
        "code": "ai_provider_error",
        "provider": "openai",
        "status": 429,
        "message": "OpenAi request failed with status 429",
        "providerError": {
            "error": {
                "message": "You exceeded your current quota",
            },
        },
    }


def test_prompt_run_returns_bad_gateway_when_anthropic_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(self: AnthropicProvider, **_: object) -> None:
        raise AnthropicProviderError(
            "Anthropic request failed with status 429",
            status_code=429,
            provider_error={
                "error": {
                    "message": "Rate limit exceeded",
                },
            },
        )

    monkeypatch.setattr(AnthropicProvider, "run", fake_run)

    client = TestClient(app)

    response = client.post(
        "/v1/prompts/run",
        json={
            "context": {
                "workspaceId": "workspace-1",
                "workflowId": "workflow-1",
                "executionId": "execution-1",
                "nodeExecutionId": "node-execution-1",
                "nodeId": "ai-summary",
                "correlationId": "correlation-1",
            },
            "config": {
                "prompt": "Summarize this lead.",
                "provider": "claude",
                "credentialId": "credential-1",
                "model": "claude-3-5-haiku-latest",
                "temperature": 0.2,
            },
            "input": {
                "leadId": "lead-1",
            },
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == {
        "code": "ai_provider_error",
        "provider": "claude",
        "status": 429,
        "message": "Anthropic request failed with status 429",
        "providerError": {
            "error": {
                "message": "Rate limit exceeded",
            },
        },
    }
