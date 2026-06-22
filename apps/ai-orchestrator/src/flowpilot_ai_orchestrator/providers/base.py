from abc import ABC, abstractmethod

from flowpilot_ai_orchestrator.schemas import PromptRunConfig, PromptRunContext, PromptRunResult


class ProviderConfigurationError(ValueError):
    def __init__(self, message: str, *, provider: str) -> None:
        self.provider = provider
        super().__init__(message)


class ProviderError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        provider: str,
        code: str = "ai_provider_error",
        status_code: int | None = None,
        retryable: bool = True,
        provider_error: object | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        self.provider_error = provider_error


class PromptProvider(ABC):
    provider_name: str

    @abstractmethod
    def run(
        self,
        *,
        context: PromptRunContext,
        config: PromptRunConfig,
        input_data: dict[str, object],
    ) -> PromptRunResult:
        raise NotImplementedError
