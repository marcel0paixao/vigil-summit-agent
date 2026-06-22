def estimate_text_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)
