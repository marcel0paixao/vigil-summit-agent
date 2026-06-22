import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from flowpilot_ai_orchestrator.config import Settings, get_settings


class CredentialClientError(RuntimeError):
    pass


class CredentialNotFoundError(CredentialClientError):
    pass


class CredentialAccessDeniedError(CredentialClientError):
    pass


class CredentialSecret(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    workspace_id: str = Field(alias="workspaceId")
    type: str
    kind: str
    capabilities: list[str]
    value: str


class CredentialClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def get_secret(self, workspace_id: str, credential_id: str) -> CredentialSecret:
        url = (
            f"{self.settings.flowpilot_api_url.rstrip('/')}"
            f"/internal/workspaces/{workspace_id}/credentials/{credential_id}/secret"
        )

        try:
            response = httpx.get(
                url,
                headers={
                    "Authorization": f"Bearer {self.settings.flowpilot_internal_api_token}"
                },
                timeout=self.settings.http_timeout_seconds,
            )
        except httpx.TimeoutException as error:
            raise CredentialClientError("Credential lookup timed out") from error
        except httpx.HTTPError as error:
            raise CredentialClientError("Credential lookup failed") from error

        if response.status_code == 403:
            raise CredentialAccessDeniedError("Internal credential access denied")

        if response.status_code == 404:
            raise CredentialNotFoundError("Credential not found")

        if response.status_code >= 400:
            raise CredentialClientError(
                f"Credential lookup failed with status {response.status_code}"
            )

        try:
            return CredentialSecret.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            raise CredentialClientError("Credential lookup returned an invalid payload") from error


def ensure_credential_supports(
    credential: CredentialSecret,
    *,
    expected_type: str,
    expected_kind: str,
    required_capability: str,
) -> None:
    if credential.type != expected_type:
        raise CredentialClientError("Credential type does not match provider")

    if credential.kind != expected_kind:
        raise CredentialClientError("Credential kind is not compatible")

    if required_capability not in credential.capabilities:
        raise CredentialClientError("Credential capability is missing")
