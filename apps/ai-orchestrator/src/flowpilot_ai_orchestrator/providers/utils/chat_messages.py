import json

from flowpilot_ai_orchestrator.schemas import PromptRunConfig

ChatMessage = dict[str, str]


def build_chat_messages(
    *,
    config: PromptRunConfig,
    input_data: dict[str, object],
) -> list[ChatMessage]:
    messages: list[ChatMessage] = []

    if config.system_prompt:
        messages.append({"role": "system", "content": config.system_prompt})

    messages.append(build_user_chat_message(config=config, input_data=input_data))

    return messages


def build_anthropic_messages(
    *,
    config: PromptRunConfig,
    input_data: dict[str, object],
) -> list[ChatMessage]:
    return [build_user_chat_message(config=config, input_data=input_data)]


def build_anthropic_system_prompt(config: PromptRunConfig) -> str | None:
    return config.system_prompt


def build_user_chat_message(
    *,
    config: PromptRunConfig,
    input_data: dict[str, object],
) -> ChatMessage:
    user_content = (
        f"{config.prompt}\n\n"
        f"Input:\n{json.dumps(input_data, ensure_ascii=False, sort_keys=True)}"
    )

    return {"role": "user", "content": user_content}
