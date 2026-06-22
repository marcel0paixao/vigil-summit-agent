import json
import time
from collections.abc import Callable
from typing import Protocol

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from flowpilot_ai_orchestrator.clients import CredentialClient
from flowpilot_ai_orchestrator.clients.credentials import ensure_credential_supports
from flowpilot_ai_orchestrator.providers.base import (
    PromptProvider,
    ProviderConfigurationError,
    ProviderError,
)
from flowpilot_ai_orchestrator.providers.utils import (
    build_chat_messages,
    estimate_text_tokens,
    extract_openai_compatible_content,
    extract_openai_compatible_finish_reason,
    extract_openai_compatible_token_usage,
)
from flowpilot_ai_orchestrator.schemas import (
    PromptRunConfig,
    PromptRunContext,
    PromptRunResult,
    PromptTrace,
    TokenUsage,
)

DEFAULT_OPENAI_TIMEOUT_SECONDS = 30.0


class OpenAIResponse(Protocol):
    def model_dump(self, *, mode: str) -> dict[str, object] | list[object]: ...


class OpenAIChatCompletionsClient(Protocol):
    def create(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
    ) -> OpenAIResponse: ...


class OpenAIChatClient(Protocol):
    completions: OpenAIChatCompletionsClient


class OpenAIClient(Protocol):
    chat: OpenAIChatClient


OpenAIClientFactory = Callable[[str, float], OpenAIClient]


class OpenAiProviderError(ProviderError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        provider_error: object | None = None,
    ) -> None:
        super().__init__(
            message,
            provider="openai",
            status_code=status_code,
            provider_error=provider_error,
        )


class OpenAiProvider(PromptProvider):
    provider_name = "openai"

    def __init__(
        self,
        credential_client: CredentialClient | None = None,
        *,
        client_factory: OpenAIClientFactory | None = None,
        timeout_seconds: float = DEFAULT_OPENAI_TIMEOUT_SECONDS,
    ) -> None:
        self.credential_client = credential_client
        self.client_factory = client_factory or create_openai_client
        self.timeout_seconds = timeout_seconds

    def run(
        self,
        *,
        context: PromptRunContext,
        config: PromptRunConfig,
        input_data: dict[str, object],
    ) -> PromptRunResult:
        input_keys = sorted(input_data.keys())
        compact_input = json.dumps(input_data, separators=(",", ":"), sort_keys=False)

        if config.credential_id is None:
            raise ProviderConfigurationError(
                "OpenAI provider requires credentialId",
                provider=self.provider_name,
            )

        credential = self._get_credential(context.workspace_id, config.credential_id)

        payload = {
            "model": config.model,
            "temperature": config.temperature,
            "messages": build_chat_messages(config=config, input_data=input_data),
        }

        try:
            started_at = time.perf_counter()
            client = self.client_factory(credential, self.timeout_seconds)
            response = client.chat.completions.create(
                model=payload["model"],
                messages=payload["messages"],
                temperature=payload["temperature"],
            )
            provider_latency_ms = int((time.perf_counter() - started_at) * 1000)
        except APITimeoutError as error:
            raise OpenAiProviderError("OpenAI request timed out") from error
        except APIStatusError as error:
            status_code = error.status_code
            raise OpenAiProviderError(
                f"OpenAI request failed with status {status_code}",
                status_code=status_code,
                provider_error=error.body,
            ) from error
        except APIConnectionError as error:
            raise OpenAiProviderError("OpenAI request failed") from error

        try:
            response_body = response.model_dump(mode="json")
            if not isinstance(response_body, dict):
                raise TypeError("OpenAI response body must be an object")

            summary = extract_openai_compatible_content(response_body)
            finish_reason = extract_openai_compatible_finish_reason(response_body)
            input_tokens, output_tokens = extract_openai_compatible_token_usage(
                response_body
            )
        except (ValueError, TypeError) as error:
            raise OpenAiProviderError("OpenAI returned an invalid response") from error

        estimated_input_tokens = estimate_text_tokens(config.prompt + compact_input)
        estimated_output_tokens = max(12, estimate_text_tokens(summary))

        return PromptRunResult(
            provider=self.provider_name,
            model=config.model,
            prompt=config.prompt,
            temperature=config.temperature,
            summary=summary,
            tokens=TokenUsage(
                input=(
                    input_tokens if input_tokens is not None else estimated_input_tokens
                ),
                output=(
                    output_tokens
                    if output_tokens is not None
                    else estimated_output_tokens
                ),
            ),
            trace=PromptTrace(
                deterministic=False,
                inputKeys=input_keys,
                providerLatencyMs=provider_latency_ms,
                finishReason=finish_reason,
            ),
        )

    def _get_credential(self, workspace_id: str, credential_id: str):
        credential_client = self.credential_client or CredentialClient()
        credential = credential_client.get_secret(
            workspace_id=workspace_id, credential_id=credential_id
        )

        ensure_credential_supports(
            credential,
            expected_type="openai",
            expected_kind="llm",
            required_capability="llm.chat",
        )

        if credential is None:
            raise ProviderConfigurationError(
                "OpenAI provider requires credentialId",
                provider=self.provider_name,
            )

        return credential.value


def create_openai_client(api_key: str, timeout_seconds: float) -> OpenAIClient:
    return OpenAI(api_key=api_key, timeout=timeout_seconds)
