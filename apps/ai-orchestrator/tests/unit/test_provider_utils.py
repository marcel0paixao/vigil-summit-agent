import pytest

from flowpilot_ai_orchestrator.providers.utils import (
    build_anthropic_messages,
    build_anthropic_system_prompt,
    build_chat_messages,
    estimate_text_tokens,
    extract_anthropic_content,
    extract_anthropic_stop_reason,
    extract_anthropic_token_usage,
    extract_openai_compatible_content,
)
from flowpilot_ai_orchestrator.schemas import PromptRunConfig


def test_build_chat_messages_includes_system_prompt_and_input_data() -> None:
    messages = build_chat_messages(
        config=PromptRunConfig(
            prompt="Summarize this lead.",
            systemPrompt="Be concise.",
            provider="openrouter",
            model="openai/gpt-oss-20b:free",
            temperature=0.2,
        ),
        input_data={"leadId": "lead-1"},
    )

    assert messages == [
        {"role": "system", "content": "Be concise."},
        {
            "role": "user",
            "content": 'Summarize this lead.\n\nInput:\n{"leadId": "lead-1"}',
        },
    ]


def test_build_anthropic_messages_omits_system_role() -> None:
    config = PromptRunConfig(
        prompt="Summarize this lead.",
        systemPrompt="Be concise.",
        provider="claude",
        model="claude-3-5-haiku-latest",
        temperature=0.2,
    )

    messages = build_anthropic_messages(
        config=config,
        input_data={"leadId": "lead-1"},
    )

    assert build_anthropic_system_prompt(config) == "Be concise."
    assert messages == [
        {
            "role": "user",
            "content": 'Summarize this lead.\n\nInput:\n{"leadId": "lead-1"}',
        },
    ]


def test_extract_openai_compatible_content_returns_message_content() -> None:
    content = extract_openai_compatible_content(
        {
            "choices": [
                {
                    "message": {
                        "content": "Lead summary",
                    },
                },
            ],
        }
    )

    assert content == "Lead summary"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"choices": []},
        {"choices": [{}]},
        {"choices": [{"message": {}}]},
        {"choices": [{"message": {"content": ""}}]},
    ],
)
def test_extract_openai_compatible_content_rejects_invalid_payloads(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValueError):
        extract_openai_compatible_content(payload)


def test_extract_anthropic_content_returns_joined_text_blocks() -> None:
    content = extract_anthropic_content(
        {
            "content": [
                {
                    "type": "text",
                    "text": "Lead ",
                },
                {
                    "type": "tool_use",
                    "name": "ignored",
                },
                {
                    "type": "text",
                    "text": "summary",
                },
            ],
        }
    )

    assert content == "Lead summary"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"content": []},
        {"content": [{}]},
        {"content": [{"type": "image", "source": {}}]},
        {"content": [{"type": "text", "text": ""}]},
    ],
)
def test_extract_anthropic_content_rejects_invalid_payloads(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValueError):
        extract_anthropic_content(payload)


def test_extract_anthropic_stop_reason_returns_string_or_none() -> None:
    assert extract_anthropic_stop_reason({"stop_reason": "end_turn"}) == "end_turn"
    assert extract_anthropic_stop_reason({"stop_reason": None}) is None
    assert extract_anthropic_stop_reason({}) is None


def test_extract_anthropic_token_usage_returns_input_and_output_tokens() -> None:
    assert extract_anthropic_token_usage(
        {
            "usage": {
                "input_tokens": 11,
                "output_tokens": 7,
            },
        }
    ) == (11, 7)


def test_extract_anthropic_token_usage_returns_none_for_missing_or_invalid_usage() -> None:
    assert extract_anthropic_token_usage({}) == (None, None)
    assert extract_anthropic_token_usage({"usage": {"input_tokens": -1}}) == (None, None)


def test_estimate_text_tokens_returns_rough_character_based_estimate() -> None:
    assert estimate_text_tokens("") == 1
    assert estimate_text_tokens("abcd") == 1
    assert estimate_text_tokens("abcde") == 2
