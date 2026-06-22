import httpx
import pytest

from flowpilot_ai_orchestrator.clients.credentials import (
    CredentialAccessDeniedError,
    CredentialClient,
    CredentialClientError,
    CredentialNotFoundError,
    CredentialSecret,
    ensure_credential_supports,
)


class FakeSettings:
    flowpilot_api_url = "http://api.test/api"
    flowpilot_internal_api_token = "internal-token"
    http_timeout_seconds = 3.0


class FakeResponse:
    def __init__(self, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


def test_credential_client_fetches_and_validates_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_get(url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
        captured["url"] = url
        captured["headers"] = headers
        captured["timeout"] = timeout
        return FakeResponse(
            200,
            {
                "id": "credential-1",
                "workspaceId": "workspace-1",
                "type": "openrouter",
                "kind": "llm",
                "capabilities": ["llm.chat"],
                "value": "sk-test",
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)

    credential = CredentialClient(settings=FakeSettings()).get_secret(
        "workspace-1",
        "credential-1",
    )

    assert credential.value == "sk-test"
    assert credential.workspace_id == "workspace-1"
    assert captured == {
        "url": "http://api.test/api/internal/workspaces/workspace-1/credentials/credential-1/secret",
        "headers": {"Authorization": "Bearer internal-token"},
        "timeout": 3.0,
    }


@pytest.mark.parametrize(
    ("status_code", "expected_error"),
    [
        (403, CredentialAccessDeniedError),
        (404, CredentialNotFoundError),
        (500, CredentialClientError),
    ],
)
def test_credential_client_maps_error_statuses(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    expected_error: type[Exception],
) -> None:
    def fake_get(url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
        return FakeResponse(status_code, {"message": "error"})

    monkeypatch.setattr(httpx, "get", fake_get)

    with pytest.raises(expected_error):
        CredentialClient(settings=FakeSettings()).get_secret("workspace-1", "credential-1")


def test_credential_client_maps_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get(url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(httpx, "get", fake_get)

    with pytest.raises(CredentialClientError, match="timed out"):
        CredentialClient(settings=FakeSettings()).get_secret("workspace-1", "credential-1")


def test_credential_client_rejects_invalid_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get(url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
        return FakeResponse(200, {"id": "credential-1"})

    monkeypatch.setattr(httpx, "get", fake_get)

    with pytest.raises(CredentialClientError, match="invalid payload"):
        CredentialClient(settings=FakeSettings()).get_secret("workspace-1", "credential-1")


def test_ensure_credential_supports_accepts_matching_credentials() -> None:
    credential = CredentialSecret(
        id="credential-1",
        workspaceId="workspace-1",
        type="openrouter",
        kind="llm",
        capabilities=["llm.chat"],
        value="sk-test",
    )

    ensure_credential_supports(
        credential,
        expected_type="openrouter",
        expected_kind="llm",
        required_capability="llm.chat",
    )


@pytest.mark.parametrize(
    ("credential_type", "credential_kind", "capabilities", "message"),
    [
        ("openai", "llm", ["llm.chat"], "type"),
        ("openrouter", "search", ["llm.chat"], "kind"),
        ("openrouter", "llm", ["llm.embeddings"], "capability"),
    ],
)
def test_ensure_credential_supports_rejects_incompatible_credentials(
    credential_type: str,
    credential_kind: str,
    capabilities: list[str],
    message: str,
) -> None:
    credential = CredentialSecret(
        id="credential-1",
        workspaceId="workspace-1",
        type=credential_type,
        kind=credential_kind,
        capabilities=capabilities,
        value="sk-test",
    )

    with pytest.raises(CredentialClientError, match=message):
        ensure_credential_supports(
            credential,
            expected_type="openrouter",
            expected_kind="llm",
            required_capability="llm.chat",
        )
