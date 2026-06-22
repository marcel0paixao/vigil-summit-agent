import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  createCredential,
  deleteCredential,
  listCredentials,
  type CreateCredentialRequest
} from "@/shared/api/credentials";
import { queryKeys } from "@/shared/api/query-keys";
import type { CredentialKind, CredentialType } from "@/shared/api/types";
import { formatDateTime } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";

const CREDENTIAL_TYPES: Array<{
  value: CredentialType;
  label: string;
  kind: CredentialKind;
  description: string;
}> = [
  {
    value: "openrouter",
    label: "OpenRouter",
    kind: "llm",
    description: "Cloud LLM provider used by AI prompt nodes."
  },
  {
    value: "ollama",
    label: "Ollama",
    kind: "llm",
    description: "Local model provider planned for Llama experiments."
  },
  {
    value: "openai",
    label: "OpenAI",
    kind: "llm",
    description: "Direct OpenAI provider planned after the provider boundary stabilizes."
  },
  {
    value: "claude",
    label: "Claude",
    kind: "llm",
    description: "Anthropic Claude provider planned for model comparison workflows."
  },
  {
    value: "gemini",
    label: "Gemini",
    kind: "llm",
    description: "Google Gemini provider planned for multimodal and low-cost model comparison."
  }
];

export function CredentialsPage() {
  const { workspaceId = "" } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateCredentialRequest>({
    name: "",
    type: "openrouter",
    kind: "llm",
    value: ""
  });
  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(workspaceId),
    queryFn: () => listCredentials(workspaceId),
    enabled: Boolean(workspaceId)
  });
  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && form.value.trim().length > 0,
    [form.name, form.value]
  );
  const selectedCredentialType = getCredentialType(form.type);
  const createMutation = useMutation({
    mutationFn: () =>
      createCredential(workspaceId, {
        name: form.name.trim(),
        type: form.type,
        kind: getCredentialTypeKind(form.type),
        value: form.value
      }),
    onSuccess: async () => {
      setForm({ name: "", type: "openrouter", kind: "llm", value: "" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials(workspaceId) });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (credentialId: string) => deleteCredential(workspaceId, credentialId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.credentials(workspaceId) });
    }
  });

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Credentials</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Workspace-scoped secrets used by workflow nodes. AI prompt nodes only show compatible
          LLM credentials for the selected provider.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Saved credentials</CardTitle>
            <CardDescription>
              Secret values are encrypted and never returned to the browser after creation.
            </CardDescription>
          </CardHeader>
          {credentialsQuery.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <CardContent className="grid gap-3">
              {credentialsQuery.data?.map((credential) => (
                <div
                  key={credential.id}
                  className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0 space-y-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <KeyRound className="size-4 text-muted-foreground" />
                      <span className="break-words font-medium">{credential.name}</span>
                      <Badge variant="info">{credential.type}</Badge>
                      <Badge variant="secondary">{credential.kind}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {credential.capabilities.map((capability) => (
                        <Badge key={capability} variant="outline">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Last used: {credential.lastUsedAt ? formatDateTime(credential.lastUsedAt) : "Never"}</span>
                      <span>Created: {formatDateTime(credential.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    aria-label={`Delete ${credential.name}`}
                    className="self-start justify-self-start md:justify-self-end"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(credential.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {credentialsQuery.data?.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No credentials yet.
                </div>
              ) : null}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add credential</CardTitle>
            <CardDescription>
              Pick a provider, name the key, and paste the secret once. Capabilities are inferred
              from the credential kind.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4 text-muted-foreground" />
                AI provider credential
              </div>
              <p className="mt-1 text-muted-foreground">{selectedCredentialType.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{selectedCredentialType.kind}</Badge>
                <Badge variant="outline">llm.chat</Badge>
                <Badge variant="outline">llm.structured_output</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-type">Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="credential-type"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as CredentialType,
                    kind: getCredentialTypeKind(event.target.value as CredentialType)
                  }))
                }
              >
                {CREDENTIAL_TYPES.map((credentialType) => (
                  <option key={credentialType.value} value={credentialType.value}>
                    {credentialType.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-name">Name</Label>
              <Input
                id="credential-name"
                maxLength={120}
                placeholder="Personal OpenRouter key"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-value">Key</Label>
              <Input
                autoComplete="off"
                id="credential-value"
                placeholder="Paste provider secret"
                type="password"
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The raw key is encrypted server-side and is not displayed again.
              </p>
            </div>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus />
              Add credential
            </Button>
            {createMutation.isSuccess ? (
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="size-4" />
                Credential saved.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function getCredentialTypeKind(type: CredentialType): CredentialKind {
  return getCredentialType(type).kind;
}

function getCredentialType(type: CredentialType) {
  return CREDENTIAL_TYPES.find((item) => item.value === type) ?? CREDENTIAL_TYPES[0];
}
