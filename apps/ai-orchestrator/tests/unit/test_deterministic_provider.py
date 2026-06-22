import json

from flowpilot_ai_orchestrator.providers import DeterministicPromptProvider
from flowpilot_ai_orchestrator.schemas import PromptRunConfig, PromptRunContext


def test_deterministic_provider_returns_stable_prompt_result() -> None:
    provider = DeterministicPromptProvider()
    config = PromptRunConfig(
        prompt="Summarize this lead.",
        model="mock-flowpilot-llm",
        temperature=0.2,
    )
    input_data = {
        "leadId": "lead-1",
        "email": "lead@example.test",
    }

    first_result = provider.run(context=make_context(), config=config, input_data=input_data)
    second_result = provider.run(context=make_context(), config=config, input_data=input_data)

    compact_input = json.dumps(input_data, separators=(",", ":"), sort_keys=False)
    assert first_result == second_result
    assert first_result.provider == "deterministic"
    assert first_result.model == "mock-flowpilot-llm"
    assert first_result.prompt == "Summarize this lead."
    assert first_result.temperature == 0.2
    assert first_result.summary == "Mock AI response for 2 input fields: email, leadId."
    assert first_result.tokens.input == (len(config.prompt) + len(compact_input) + 3) // 4
    assert first_result.tokens.output == 12
    assert first_result.trace.deterministic is True
    assert first_result.trace.input_keys == ["email", "leadId"]


def test_deterministic_provider_uses_prompt_config_defaults() -> None:
    provider = DeterministicPromptProvider()
    config = PromptRunConfig(prompt="Classify this support ticket.")

    result = provider.run(
        context=make_context(),
        config=config,
        input_data={"ticketId": "ticket-1"},
    )

    assert result.model == "mock-flowpilot-llm"
    assert result.temperature == 0.2
    assert result.trace.input_keys == ["ticketId"]


def test_deterministic_provider_handles_empty_input() -> None:
    provider = DeterministicPromptProvider()
    config = PromptRunConfig(prompt="Summarize the input.")

    result = provider.run(context=make_context(), config=config, input_data={})

    assert result.summary == "Mock AI response for 0 input fields: none."
    assert result.tokens.output == 12
    assert result.trace.input_keys == []


def make_context() -> PromptRunContext:
    return PromptRunContext(
        workspaceId="workspace-1",
        workflowId="workflow-1",
        executionId="execution-1",
        nodeExecutionId="node-execution-1",
        nodeId="ai-summary",
        correlationId="correlation-1",
    )
