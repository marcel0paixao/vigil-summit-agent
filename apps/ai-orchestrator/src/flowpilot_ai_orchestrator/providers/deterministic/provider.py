import json

from flowpilot_ai_orchestrator.providers.base import PromptProvider
from flowpilot_ai_orchestrator.schemas import (
    PromptRunConfig,
    PromptRunContext,
    PromptRunResult,
    PromptTrace,
    TokenUsage,
)


class DeterministicPromptProvider(PromptProvider):
    provider_name = "deterministic"

    def run(
        self,
        *,
        context: PromptRunContext,
        config: PromptRunConfig,
        input_data: dict[str, object],
    ) -> PromptRunResult:
        input_keys = sorted(input_data.keys())
        compact_input = json.dumps(input_data, separators=(",", ":"), sort_keys=False)

        return PromptRunResult(
            provider=self.provider_name,
            model=config.model,
            prompt=config.prompt,
            temperature=config.temperature,
            summary=(
                f"Mock AI response for {len(input_keys)} input fields: "
                f"{', '.join(input_keys) if input_keys else 'none'}."
            ),
            tokens=TokenUsage(
                input=(len(config.prompt) + len(compact_input) + 3) // 4,
                output=max(12, (len(" ".join(input_keys)) + 3) // 4),
            ),
            trace=PromptTrace(
                deterministic=True,
                inputKeys=input_keys,
                providerLatencyMs=0,
                finishReason="deterministic",
            ),
        )
