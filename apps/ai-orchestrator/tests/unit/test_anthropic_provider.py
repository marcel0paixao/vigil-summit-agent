from flowpilot_ai_orchestrator.clients.credentials import CredentialSecret
from flowpilot_ai_orchestrator.providers.anthropic.provider import AnthropicProvider
from flowpilot_ai_orchestrator.schemas import PromptRunConfig, PromptRunContext


class FakeCredentialClient:
    def get_secret(self, workspace_id: str, credential_id: str) -> CredentialSecret:
        return CredentialSecret(
            id=credential_id,
            workspaceId=workspace_id,
            type="claude",
            kind="llm",
            capabilities=["llm.chat"],
            value="sk-ant-test",
        )


class FakeResponse:
    def model_dump(self, *, mode: str) -> dict[str, object]:
        assert mode == "json"
        return {
            "content": [{"type": "text", "text": "Personalized draft"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 17, "output_tokens": 8},
        }


def test_anthropic_provider_uses_messages_api() -> None:
    captured: dict[str, object] = {}

    class FakeMessages:
        def create(self, **kwargs: object) -> FakeResponse:
            captured.update(kwargs)
            return FakeResponse()

    class FakeClient:
        messages = FakeMessages()

    provider = AnthropicProvider(
        credential_client=FakeCredentialClient(),
        client_factory=lambda api_key, timeout: FakeClient(),
    )
    result = provider.run(
        context=PromptRunContext(
            workspaceId="workspace-1",
            workflowId="engagement",
            executionId="decision-1",
            nodeId="draft-message",
            correlationId="registration-1",
        ),
        config=PromptRunConfig(
            prompt="Draft a concise invitation.",
            systemPrompt="Use only supplied facts.",
            provider="anthropic",
            credentialId="credential-1",
            model="claude-sonnet-4-5",
            temperature=0.2,
        ),
        input_data={"leadName": "Mariana"},
    )

    assert captured["model"] == "claude-sonnet-4-5"
    assert captured["max_tokens"] == 1024
    assert captured["system"] == "Use only supplied facts."
    assert captured["messages"] == [
        {
            "role": "user",
            "content": 'Draft a concise invitation.\n\nInput:\n{"leadName": "Mariana"}',
        }
    ]
    assert result.summary == "Personalized draft"
    assert result.tokens.input == 17
    assert result.tokens.output == 8
