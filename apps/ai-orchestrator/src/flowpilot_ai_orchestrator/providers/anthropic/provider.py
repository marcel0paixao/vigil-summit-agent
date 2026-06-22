import json
import os
import time
from collections.abc import Callable
from typing import Protocol

from anthropic import Anthropic, APIConnectionError, APIStatusError, APITimeoutError

from flowpilot_ai_orchestrator.clients import CredentialClient
from flowpilot_ai_orchestrator.clients.credentials import (
    CredentialClientError,
    ensure_credential_supports,
)
from flowpilot_ai_orchestrator.providers.base import (
    PromptProvider,
    ProviderConfigurationError,
    ProviderError,
)
from flowpilot_ai_orchestrator.providers.utils import (
    build_anthropic_messages,
    build_anthropic_system_prompt,
    estimate_text_tokens,
    extract_anthropic_compatible_content,
    extract_anthropic_compatible_finish_reason,
    extract_anthropic_compatible_token_usage,
)
from flowpilot_ai_orchestrator.schemas import (
    PromptRunConfig,
    PromptRunContext,
    PromptRunResult,
    PromptTrace,
    TokenUsage,
)

DEFAULT_ANTHROPIC_TIMEOUT_SECONDS = 30.0


class AnthropicResponse(Protocol):
    def model_dump(self, *, mode: str) -> dict[str, object] | list[object]: ...


class AnthropicMessagesClient(Protocol):
    def create(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        system: str = "",
    ) -> AnthropicResponse: ...


class AnthropicClient(Protocol):
    messages: AnthropicMessagesClient


AnthropicClientFactory = Callable[[str, float], AnthropicClient]


class AnthropicProviderError(ProviderError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        provider_error: object | None = None,
    ) -> None:
        super().__init__(
            message,
            provider="claude",
            status_code=status_code,
            provider_error=provider_error,
        )


class AnthropicProvider(PromptProvider):
    provider_name = "anthropic"

    def __init__(
        self,
        credential_client: CredentialClient | None = None,
        *,
        client_factory: AnthropicClientFactory | None = None,
        timeout_seconds: float = DEFAULT_ANTHROPIC_TIMEOUT_SECONDS,
    ) -> None:
        self.credential_client = credential_client
        self.client_factory = client_factory or create_anthropic_client
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

        credential = self._get_credential(context.workspace_id, config.credential_id)

        payload = {
            "model": config.model,
            "max_tokens": 1024,
            "temperature": config.temperature,
            "messages": build_anthropic_messages(config=config, input_data=input_data),
            "system": build_anthropic_system_prompt(config) or "",
        }

        try:
            started_at = time.perf_counter()
            client = self.client_factory(credential, self.timeout_seconds)
            response = client.messages.create(
                model=payload["model"],
                messages=payload["messages"],
                max_tokens=payload["max_tokens"],
                temperature=payload["temperature"],
                system=payload["system"],
            )
            provider_latency_ms = int((time.perf_counter() - started_at) * 1000)
        except APITimeoutError as error:
            raise AnthropicProviderError("Anthropic request timed out") from error
        except APIStatusError as error:
            status_code = error.status_code
            raise AnthropicProviderError(
                f"Anthropic request failed with status {status_code}",
                status_code=status_code,
                provider_error=error.body,
            ) from error
        except APIConnectionError as error:
            raise AnthropicProviderError("Anthropic request failed") from error

        try:
            response_body = response.model_dump(mode="json")
            if not isinstance(response_body, dict):
                raise TypeError("Anthropic response body must be an object")

            summary = extract_anthropic_compatible_content(response_body)
            finish_reason = extract_anthropic_compatible_finish_reason(response_body)
            input_tokens, output_tokens = extract_anthropic_compatible_token_usage(
                response_body
            )
        except (ValueError, TypeError) as error:
            raise AnthropicProviderError("Anthropic returned an invalid response") from error

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

    def _get_credential(self, workspace_id: str, credential_id: str | None):
        if credential_id is None:
            environment_key = os.getenv("ANTHROPIC_API_KEY")
            if environment_key:
                return environment_key
            raise ProviderConfigurationError(
                "Anthropic provider requires credentialId or ANTHROPIC_API_KEY",
                provider=self.provider_name,
            )
        credential_client = self.credential_client or CredentialClient()
        credential = credential_client.get_secret(
            workspace_id=workspace_id, credential_id=credential_id
        )

        if credential.type not in {"claude", "anthropic"}:
            raise CredentialClientError("Credential type does not match provider")

        ensure_credential_supports(
            credential,
            expected_type=credential.type,
            expected_kind="llm",
            required_capability="llm.chat",
        )

        return credential.value


def create_anthropic_client(api_key: str, timeout_seconds: float) -> AnthropicClient:
    return Anthropic(api_key=api_key, timeout=timeout_seconds)
