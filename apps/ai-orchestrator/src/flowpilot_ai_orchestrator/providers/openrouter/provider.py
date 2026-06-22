import json
import time

import httpx

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


class OpenRouterProviderError(ProviderError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        provider_error: object | None = None,
    ) -> None:
        super().__init__(
            message,
            provider="openrouter",
            status_code=status_code,
            provider_error=provider_error,
        )


class OpenRouterProvider(PromptProvider):
    provider_name = "openrouter"

    def __init__(self, credential_client: CredentialClient | None = None) -> None:
        self.credential_client = credential_client

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
                "OpenRouter provider requires credentialId",
                provider=self.provider_name,
            )

        credential = self._get_credential(context.workspace_id, config.credential_id)

        url = "https://openrouter.ai/api/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {credential}",
        }

        payload = {
            "model": config.model,
            "temperature": config.temperature,
            "messages": build_chat_messages(config=config, input_data=input_data),
        }

        try:
            started_at = time.perf_counter()
            response = httpx.post(url, headers=headers, json=payload, timeout=30)
            provider_latency_ms = int((time.perf_counter() - started_at) * 1000)
            response.raise_for_status()
        except httpx.TimeoutException as error:
            raise OpenRouterProviderError("OpenRouter request timed out") from error
        except httpx.HTTPStatusError as error:
            status_code = error.response.status_code
            raise OpenRouterProviderError(
                f"OpenRouter request failed with status {status_code}",
                status_code=status_code,
                provider_error=parse_error_response(error.response),
            ) from error
        except httpx.HTTPError as error:
            raise OpenRouterProviderError("OpenRouter request failed") from error

        try:
            response_body = response.json()
            if not isinstance(response_body, dict):
                raise TypeError("OpenRouter response body must be an object")

            summary = extract_openai_compatible_content(response_body)
            finish_reason = extract_openai_compatible_finish_reason(response_body)
            input_tokens, output_tokens = extract_openai_compatible_token_usage(
                response_body
            )
        except (ValueError, TypeError) as error:
            raise OpenRouterProviderError(
                "OpenRouter returned an invalid response"
            ) from error

        estimated_input_tokens = estimate_text_tokens(config.prompt + compact_input)
        estimated_output_tokens = max(12, estimate_text_tokens(summary))

        return PromptRunResult(
            provider=self.provider_name,
            model=config.model,
            prompt=config.prompt,
            temperature=config.temperature,
            summary=summary,
            tokens=TokenUsage(
                input=input_tokens if input_tokens is not None else estimated_input_tokens,
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
            expected_type="openrouter",
            expected_kind="llm",
            required_capability="llm.chat",
        )

        if credential is None:
            raise ProviderConfigurationError(
                "OpenRouter provider requires credentialId",
                provider=self.provider_name,
            )

        return credential.value


def parse_error_response(response: httpx.Response) -> object | None:
    try:
        return response.json()
    except ValueError:
        text = response.text.strip()
        return text[:500] if text else None
