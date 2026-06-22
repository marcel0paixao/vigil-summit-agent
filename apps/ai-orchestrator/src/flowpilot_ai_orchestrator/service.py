from flowpilot_ai_orchestrator.providers.registry import ProviderRegistry
from flowpilot_ai_orchestrator.schemas import PromptRunRequest, PromptRunResponse


class PromptService:
    def __init__(self) -> None:
        self.registry = ProviderRegistry()

    def run_prompt(self, request: PromptRunRequest) -> PromptRunResponse:
        provider = self.registry.get(request.config.provider)

        result = provider.run(
            context=request.context,
            config=request.config,
            input_data=request.input,
        )

        return PromptRunResponse(result=result)
