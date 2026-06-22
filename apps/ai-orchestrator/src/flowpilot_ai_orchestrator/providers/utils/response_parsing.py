def extract_openai_compatible_content(response_body: dict[str, object]) -> str:
    choices = response_body.get("choices")

    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenAI-compatible response has no choices")

    first_choice = choices[0]

    if not isinstance(first_choice, dict):
        raise ValueError("OpenAI-compatible response choice is invalid")

    message = first_choice.get("message")

    if not isinstance(message, dict):
        raise ValueError("OpenAI-compatible response has no message")

    content = message.get("content")

    if not isinstance(content, str) or not content.strip():
        raise ValueError("OpenAI-compatible response content is empty")

    return content


def extract_openai_compatible_finish_reason(
    response_body: dict[str, object],
) -> str | None:
    first_choice = get_first_choice(response_body)

    if first_choice is None:
        return None

    finish_reason = first_choice.get("finish_reason")

    return finish_reason if isinstance(finish_reason, str) else None


def extract_openai_compatible_token_usage(
    response_body: dict[str, object],
) -> tuple[int | None, int | None]:
    usage = response_body.get("usage")

    if not isinstance(usage, dict):
        return None, None

    input_tokens = usage.get("prompt_tokens")
    output_tokens = usage.get("completion_tokens")

    return (
        input_tokens if is_non_negative_integer(input_tokens) else None,
        output_tokens if is_non_negative_integer(output_tokens) else None,
    )


def extract_anthropic_content(response_body: dict[str, object]) -> str:
    content_blocks = response_body.get("content")

    if not isinstance(content_blocks, list) or not content_blocks:
        raise ValueError("Anthropic response has no content blocks")

    text_parts: list[str] = []

    for block in content_blocks:
        if not isinstance(block, dict):
            continue

        block_type = block.get("type")
        text = block.get("text")

        if block_type == "text" and isinstance(text, str) and text.strip():
            text_parts.append(text)

    content = "".join(text_parts).strip()

    if not content:
        raise ValueError("Anthropic response content is empty")

    return content


def extract_anthropic_stop_reason(response_body: dict[str, object]) -> str | None:
    stop_reason = response_body.get("stop_reason")

    return stop_reason if isinstance(stop_reason, str) else None


def extract_anthropic_token_usage(
    response_body: dict[str, object],
) -> tuple[int | None, int | None]:
    usage = response_body.get("usage")

    if not isinstance(usage, dict):
        return None, None

    input_tokens = usage.get("input_tokens")
    output_tokens = usage.get("output_tokens")

    return (
        input_tokens if is_non_negative_integer(input_tokens) else None,
        output_tokens if is_non_negative_integer(output_tokens) else None,
    )


extract_anthropic_compatible_content = extract_anthropic_content
extract_anthropic_compatible_finish_reason = extract_anthropic_stop_reason
extract_anthropic_compatible_token_usage = extract_anthropic_token_usage


def get_first_choice(response_body: dict[str, object]) -> dict[str, object] | None:
    choices = response_body.get("choices")

    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0]

    return first_choice if isinstance(first_choice, dict) else None


def is_non_negative_integer(value: object) -> bool:
    return isinstance(value, int) and value >= 0
