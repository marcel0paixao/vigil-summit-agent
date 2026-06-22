from fastapi import FastAPI, HTTPException

from flowpilot_ai_orchestrator.providers.anthropic.provider import AnthropicProviderError
from flowpilot_ai_orchestrator.providers.base import ProviderConfigurationError
from flowpilot_ai_orchestrator.providers.openai.provider import OpenAiProviderError
from flowpilot_ai_orchestrator.providers.openrouter.provider import OpenRouterProviderError
from flowpilot_ai_orchestrator.providers.registry import UnknownProviderError
from flowpilot_ai_orchestrator.schemas import PromptRunRequest, PromptRunResponse
from flowpilot_ai_orchestrator.service import PromptService

app = FastAPI(
    title="Vigil Engagement Agent Runtime",
    version="0.1.0",
)

prompt_service = PromptService()


@app.post("/v1/prompts/run", response_model=PromptRunResponse)
def run_prompt(request: PromptRunRequest) -> PromptRunResponse:
    try:
        return prompt_service.run_prompt(request)
    except UnknownProviderError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "unknown_ai_provider",
                "message": str(error),
                "provider": error.provider_name,
            },
        ) from error
    except ProviderConfigurationError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ai_provider_configuration_error",
                "message": str(error),
                "provider": error.provider,
            },
        ) from error
    except OpenRouterProviderError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ai_provider_error",
                "provider": "openrouter",
                "status": error.status_code,
                "message": str(error),
                "providerError": error.provider_error,
            },
        ) from error
    except OpenAiProviderError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ai_provider_error",
                "provider": "openai",
                "status": error.status_code,
                "message": str(error),
                "providerError": error.provider_error,
            },
        ) from error
    except AnthropicProviderError as error:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ai_provider_error",
                "provider": "claude",
                "status": error.status_code,
                "message": str(error),
                "providerError": error.provider_error,
            },
        ) from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
