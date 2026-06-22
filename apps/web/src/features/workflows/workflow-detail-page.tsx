import {
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_HTTP_METHODS,
  WORKFLOW_NODE_TYPES,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeType
} from "@flowpilot/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock3,
  Eye,
  GitBranch,
  History,
  Network,
  Pencil,
  Plus,
  PlayCircle,
  RotateCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/features/auth/auth-provider";
import { WorkflowCanvas } from "@/features/workflow-canvas/workflow-canvas";
import { getNodeCatalogEntry, NODE_LIBRARY } from "@/features/workflows/nodes/index";
import { RunWorkflowButton } from "@/features/workflows/run-workflow-button";
import {
  getNodeDefinitionIssueMessages,
  validateEdgeDraft,
  validateWorkflowDefinition
} from "@/features/workflows/workflow-definition-validation";
import { ApiError } from "@/shared/api/http";
import { listCredentials } from "@/shared/api/credentials";
import { queryKeys } from "@/shared/api/query-keys";
import type { IntegrationCredential, WorkflowStatus } from "@/shared/api/types";
import {
  createWorkflowVersion,
  getWorkflow,
  listWorkflowExecutions,
  listWorkflowVersions,
  restoreWorkflowVersion,
  updateWorkflow
} from "@/shared/api/workflows";
import { cn, formatDateTime, formatDuration, humanizeIdentifier } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { ErrorState } from "@/shared/ui/error-state";
import { JsonBlock } from "@/shared/ui/json-block";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";

const WORKFLOW_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const satisfies readonly WorkflowStatus[];
type WorkflowStatusValue = (typeof WORKFLOW_STATUSES)[number];

const AI_PROVIDER_OPTIONS = [
  {
    value: "deterministic",
    label: "Deterministic",
    model: "mock-flowpilot-llm",
    credentialRequired: false
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    model: "openai/gpt-oss-20b:free",
    credentialRequired: true
  },
  {
    value: "ollama",
    label: "Ollama",
    model: "llama3.2",
    credentialRequired: true
  },
  {
    value: "openai",
    label: "OpenAI",
    model: "gpt-4o-mini",
    credentialRequired: true
  },
  {
    value: "claude",
    label: "Claude",
    model: "claude-3-5-haiku-latest",
    credentialRequired: true
  },
  {
    value: "gemini",
    label: "Gemini",
    model: "gemini-2.5-flash",
    credentialRequired: true
  }
] as const;

export function WorkflowDetailPage() {
  const { workspaceId = "", workflowId = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [nodeEditorNodeId, setNodeEditorNodeId] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);
  const [draftDefinition, setDraftDefinition] = useState<WorkflowDefinition>();
  const [formError, setFormError] = useState<string>();
  const [previewVersionId, setPreviewVersionId] = useState<string>();
  const [metadataDraft, setMetadataDraft] = useState({
    name: "",
    slug: "",
    description: "",
    status: "DRAFT" as WorkflowStatusValue
  });
  const [metadataError, setMetadataError] = useState<string>();
  const workflowQuery = useQuery({
    queryKey: queryKeys.workflow(workspaceId, workflowId),
    queryFn: () => getWorkflow(workspaceId, workflowId),
    enabled: Boolean(workspaceId && workflowId)
  });
  const executionsQuery = useQuery({
    queryKey: queryKeys.workflowExecutions(workspaceId, workflowId),
    queryFn: () => listWorkflowExecutions(workspaceId, workflowId),
    enabled: Boolean(workspaceId && workflowId)
  });
  const versionsQuery = useQuery({
    queryKey: queryKeys.workflowVersions(workspaceId, workflowId),
    queryFn: () => listWorkflowVersions(workspaceId, workflowId),
    enabled: Boolean(workspaceId && workflowId)
  });
  const definition = workflowQuery.data?.currentVersion.definition;
  const activeDefinition = isEditing && draftDefinition ? draftDefinition : definition;
  const previewVersion = versionsQuery.data?.find((version) => version.id === previewVersionId);
  const currentMembership = user?.memberships.find((membership) => membership.workspace.id === workspaceId);
  const canEditWorkflow = currentMembership ? canWriteWorkflows(currentMembership.role) : false;
  const hasDraftChanges = Boolean(
    isEditing && definition && draftDefinition && !areDefinitionsEqual(definition, draftDefinition)
  );
  const hasMetadataChanges = Boolean(
    workflowQuery.data &&
      (metadataDraft.name !== workflowQuery.data.name ||
        metadataDraft.slug !== workflowQuery.data.slug ||
        metadataDraft.description !== (workflowQuery.data.description ?? "") ||
        metadataDraft.status !== workflowQuery.data.status)
  );

  useEffect(() => {
    if (definition) {
      setDraftDefinition(cloneDefinition(definition));
      setPreviewVersionId(undefined);
    }
  }, [definition, workflowQuery.data?.currentVersion.id]);

  useEffect(() => {
    if (workflowQuery.data) {
      setMetadataDraft({
        name: workflowQuery.data.name,
        slug: workflowQuery.data.slug,
        description: workflowQuery.data.description ?? "",
        status: workflowQuery.data.status
      });
      setMetadataError(undefined);
    }
  }, [workflowQuery.data]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasDraftChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasDraftChanges]);

  useEffect(() => {
    if (!selectedNodeId && activeDefinition?.nodes[0]) {
      setSelectedNodeId(activeDefinition.nodes[0].id);
      return;
    }

    if (selectedNodeId && activeDefinition && !activeDefinition.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(activeDefinition.nodes[0]?.id);
    }
  }, [activeDefinition, selectedNodeId]);

  useEffect(() => {
    if (nodeEditorNodeId && activeDefinition && !activeDefinition.nodes.some((node) => node.id === nodeEditorNodeId)) {
      setNodeEditorNodeId(undefined);
    }
  }, [activeDefinition, nodeEditorNodeId]);

  const selectedNode = useMemo(
    () => activeDefinition?.nodes.find((node) => node.id === selectedNodeId),
    [activeDefinition?.nodes, selectedNodeId]
  );
  const nodeEditorNode = useMemo(
    () => activeDefinition?.nodes.find((node) => node.id === nodeEditorNodeId),
    [activeDefinition?.nodes, nodeEditorNodeId]
  );
  const selectedEdge = useMemo(
    () => activeDefinition?.edges.find((edge) => edge.id === selectedEdgeId),
    [activeDefinition?.edges, selectedEdgeId]
  );
  const selectedNodeIssues = useMemo(
    () => (activeDefinition && selectedNode ? getNodeDefinitionIssueMessages(activeDefinition, selectedNode.id) : []),
    [activeDefinition, selectedNode]
  );
  const definitionStats = useMemo(() => {
    if (!activeDefinition) {
      return null;
    }

    return {
      triggers: activeDefinition.nodes.filter((node) => node.type.startsWith("trigger.")).length,
      actions: activeDefinition.nodes.filter((node) => node.type.startsWith("action.")).length,
      edges: activeDefinition.edges.length
    };
  }, [activeDefinition]);
  const saveMutation = useMutation({
    mutationFn: (nextDefinition: WorkflowDefinition) =>
      createWorkflowVersion(workspaceId, workflowId, {
        definition: nextDefinition
      }),
    onSuccess: async (workflow) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflow(workspaceId, workflowId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows(workspaceId) })
      ]);
      setDraftDefinition(cloneDefinition(workflow.currentVersion.definition));
      setIsEditing(false);
      setFormError(undefined);
      setPreviewVersionId(undefined);
    }
  });
  const metadataMutation = useMutation({
    mutationFn: () =>
      updateWorkflow(workspaceId, workflowId, {
        name: metadataDraft.name,
        slug: metadataDraft.slug,
        description: metadataDraft.description.trim() ? metadataDraft.description : null,
        status: metadataDraft.status
      }),
    onSuccess: async (workflow) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflow(workspaceId, workflowId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows(workspaceId) })
      ]);
      setMetadataDraft({
        name: workflow.name,
        slug: workflow.slug,
        description: workflow.description ?? "",
        status: workflow.status
      });
      setMetadataError(undefined);
    }
  });
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restoreWorkflowVersion(workspaceId, workflowId, versionId),
    onSuccess: async (workflow) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflow(workspaceId, workflowId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workflowVersions(workspaceId, workflowId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows(workspaceId) })
      ]);
      setDraftDefinition(cloneDefinition(workflow.currentVersion.definition));
      setSelectedEdgeId(undefined);
      setSelectedNodeId(workflow.currentVersion.definition.nodes[0]?.id);
      setFormError(undefined);
      setIsEditing(false);
      setPreviewVersionId(undefined);
    }
  });

  function updateDraftDefinition(updater: (definition: WorkflowDefinition) => WorkflowDefinition) {
    setDraftDefinition((currentDefinition) => {
      if (!currentDefinition) {
        return currentDefinition;
      }

      setFormError(undefined);
      return updater(currentDefinition);
    });
  }

  function handleDefinitionChange(nextDefinition: WorkflowDefinition) {
    setFormError(undefined);
    setDraftDefinition(nextDefinition);
  }

  function updateNode(nextNode: WorkflowNode) {
    updateDraftDefinition((currentDefinition) => ({
      ...currentDefinition,
      nodes: currentDefinition.nodes.map((node) => (node.id === nextNode.id ? nextNode : node))
    }));
  }

  function addNode(type: WorkflowNode["type"]) {
    updateDraftDefinition((currentDefinition) => {
      const nodeNumber = currentDefinition.nodes.length + 1;
      const node = getNodeCatalogEntry(type)?.create(nodeNumber, currentDefinition);

      if (!node) {
        return currentDefinition;
      }

      setSelectedNodeId(node.id);
      setSelectedEdgeId(undefined);

      return {
        ...currentDefinition,
        nodes: [...currentDefinition.nodes, node]
      };
    });
  }

  function deleteNode(nodeId: string) {
    updateDraftDefinition((currentDefinition) => ({
      nodes: currentDefinition.nodes.filter((node) => node.id !== nodeId),
      edges: currentDefinition.edges.filter(
        (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
      )
    }));
    setNodeEditorNodeId(undefined);

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(undefined);
    }
  }

  function openNodeEditor(nodeId: string) {
    setSelectedEdgeId(undefined);
    setSelectedNodeId(nodeId);

    if (!isEditing && canEditWorkflow) {
      setIsEditing(true);
    }

    setNodeEditorNodeId(nodeId);
  }

  function deleteSelectedEdge() {
    if (!selectedEdge) {
      return;
    }

    deleteEdge(selectedEdge.id);
  }

  function deleteEdge(edgeId: string) {
    updateDraftDefinition((currentDefinition) => ({
      ...currentDefinition,
      edges: currentDefinition.edges.filter((edge) => edge.id !== edgeId)
    }));
    setSelectedEdgeId(undefined);
  }

  function updateSelectedEdge(sourceNodeId: string, targetNodeId: string) {
    if (!selectedEdge) {
      return;
    }

    updateDraftDefinition((currentDefinition) => {
      const edgeValidationError = validateEdgeDraft({
        definition: currentDefinition,
        sourceNodeId,
        targetNodeId,
        ignoredEdgeId: selectedEdge.id
      });

      if (edgeValidationError) {
        setFormError(edgeValidationError);
        return currentDefinition;
      }

      const edgeId =
        selectedEdge.id === `${sourceNodeId}-to-${targetNodeId}`
          ? selectedEdge.id
          : getUniqueEdgeId(`${sourceNodeId}-to-${targetNodeId}`, currentDefinition, selectedEdge.id);

      setSelectedEdgeId(edgeId);

      return {
        ...currentDefinition,
        edges: currentDefinition.edges.map((edge) =>
          edge.id === selectedEdge.id
            ? {
                id: edgeId,
                sourceNodeId,
                targetNodeId
              }
            : edge
        )
      };
    });
  }

  async function saveDefinition() {
    if (!draftDefinition) {
      return;
    }

    const validation = validateWorkflowDefinition(draftDefinition);

    if (!validation.success) {
      setFormError(validation.messages.join("; "));
      return;
    }

    try {
      await saveMutation.mutateAsync(validation.definition);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Workflow version save failed");
    }
  }

  async function saveMetadata() {
    setMetadataError(undefined);

    if (!metadataDraft.name.trim()) {
      setMetadataError("Workflow name is required.");
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadataDraft.slug)) {
      setMetadataError("Slug must use lowercase letters, numbers, and single hyphens.");
      return;
    }

    try {
      await metadataMutation.mutateAsync();
    } catch (error) {
      setMetadataError(error instanceof ApiError ? error.message : "Workflow metadata save failed");
    }
  }

  function discardDraft() {
    if (definition) {
      setDraftDefinition(cloneDefinition(definition));
    }
    setFormError(undefined);
    setIsEditing(false);
    setPreviewVersionId(undefined);
  }

  async function restoreVersion(versionId: string) {
    try {
      await restoreMutation.mutateAsync(versionId);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Workflow version restore failed");
    }
  }

  if (workflowQuery.isError) {
    return (
      <section className="grid gap-6 p-4 lg:p-6">
        <ErrorState
          title="Workflow could not be loaded"
          message={workflowQuery.error instanceof Error ? workflowQuery.error.message : undefined}
          onRetry={() => void workflowQuery.refetch()}
        />
      </section>
    );
  }

  if (workflowQuery.isLoading || !workflowQuery.data || !definition || !activeDefinition) {
    return (
      <section className="grid gap-6 p-4 lg:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[32rem] w-full" />
      </section>
    );
  }

  return (
    <section className="flex min-h-full flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-normal">{workflowQuery.data.name}</h1>
            <StatusBadge status={workflowQuery.data.status} />
            <Badge variant="outline">v{workflowQuery.data.currentVersion.version}</Badge>
            {hasDraftChanges ? <Badge variant="warning">Unsaved draft</Badge> : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {workflowQuery.data.description ?? workflowQuery.data.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Open version history" disabled={versionsQuery.isLoading} variant="outline">
                <History />
                Versions
                <Badge variant="outline">v{workflowQuery.data.currentVersion.version}</Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
              <DropdownMenuLabel>
                <span className="block">Version history</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Restore creates a new version from the selected snapshot.
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {versionsQuery.data && versionsQuery.data.length > 0 ? (
                versionsQuery.data.map((version) => {
                  const isCurrent = version.id === workflowQuery.data.currentVersion.id;

                  return (
                    <DropdownMenuItem
                      key={version.id}
                      aria-label={
                        isCurrent ? `Current version ${version.version}` : `Preview version ${version.version}`
                      }
                      className="items-start gap-3 py-3"
                      disabled={restoreMutation.isPending}
                      onClick={() => setPreviewVersionId(version.id)}
                    >
                      {isCurrent ? (
                        <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <Badge variant={isCurrent ? "success" : "outline"}>v{version.version}</Badge>
                          {isCurrent ? <span className="text-xs text-muted-foreground">Current</span> : null}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatDateTime(version.createdAt)} · {version.definition.nodes.length} nodes ·{" "}
                          {version.definition.edges.length} edges
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })
              ) : (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">No versions yet.</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={discardDraft}>
                <X />
                Discard
              </Button>
              <Button onClick={saveDefinition} disabled={!hasDraftChanges || saveMutation.isPending}>
                <Save />
                {saveMutation.isPending ? "Saving" : hasDraftChanges ? "Save version" : "No changes"}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={!canEditWorkflow} onClick={() => setIsEditing(true)}>
              Edit workflow
            </Button>
          )}
          <RunWorkflowButton disabled={!canEditWorkflow} workspaceId={workspaceId} workflowId={workflowId} />
        </div>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Workflow metadata</CardTitle>
            <CardDescription>Name, slug, description, and lifecycle status.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_12rem_auto]">
            <div className="space-y-2">
              <Label htmlFor="workflow-metadata-name">Name</Label>
              <Input
                id="workflow-metadata-name"
                value={metadataDraft.name}
                onChange={(event) => setMetadataDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-metadata-slug">Slug</Label>
              <Input
                id="workflow-metadata-slug"
                value={metadataDraft.slug}
                onChange={(event) => setMetadataDraft((current) => ({ ...current, slug: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-metadata-status">Status</Label>
              <select
                id="workflow-metadata-status"
                className="liquid-field h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={metadataDraft.status}
                onChange={(event) =>
                  setMetadataDraft((current) => ({ ...current, status: event.target.value as WorkflowStatusValue }))
                }
              >
                {WORKFLOW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {humanizeIdentifier(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full justify-center"
                disabled={!hasMetadataChanges || metadataMutation.isPending}
                variant="outline"
                onClick={saveMetadata}
              >
                <Save />
                {metadataMutation.isPending ? "Saving" : "Save metadata"}
              </Button>
            </div>
            <div className="space-y-2 lg:col-span-4">
              <Label htmlFor="workflow-metadata-description">Description</Label>
              <Textarea
                id="workflow-metadata-description"
                value={metadataDraft.description}
                onChange={(event) =>
                  setMetadataDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            {metadataError ? <p className="text-sm text-destructive lg:col-span-4">{metadataError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {previewVersion ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={previewVersion.id === workflowQuery.data.currentVersion.id ? "success" : "outline"}>
                  v{previewVersion.version}
                </Badge>
                <span className="text-sm font-medium">Version preview</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(previewVersion.createdAt)} · {previewVersion.definition.nodes.length} nodes ·{" "}
                {previewVersion.definition.edges.length} edges
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreviewVersionId(undefined)}>
                <X />
                Close
              </Button>
              <Button
                size="sm"
                disabled={
                  previewVersion.id === workflowQuery.data.currentVersion.id || restoreMutation.isPending
                }
                onClick={() => restoreVersion(previewVersion.id)}
              >
                <RotateCcw />
                {restoreMutation.isPending ? "Restoring" : "Restore this version"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4">
        <WorkflowCanvas
          canvasToolbar={isEditing ? <AddNodeMenu onAddNode={addNode} /> : undefined}
          definition={activeDefinition}
          editable={isEditing}
          selectedEdgeId={selectedEdgeId}
          selectedNodeId={selectedNodeId}
          onDefinitionChange={handleDefinitionChange}
          onEditNode={openNodeEditor}
          onSelectEdge={setSelectedEdgeId}
          onSelectNode={setSelectedNodeId}
        />
        {formError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        {definitionStats ? (
          <div className="liquid-glass grid gap-0 overflow-hidden rounded-lg border border-border bg-card/70 md:grid-cols-3">
            <WorkflowMetric icon={PlayCircle} label="Triggers" value={String(definitionStats.triggers)} />
            <WorkflowMetric icon={GitBranch} label="Actions" value={String(definitionStats.actions)} />
            <WorkflowMetric icon={Network} label="Edges" value={String(definitionStats.edges)} />
          </div>
        ) : null}
        {selectedEdge ? (
          <Card>
            <CardHeader>
              <CardTitle>Edge details</CardTitle>
              <CardDescription>{selectedEdge.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <EdgeInspector
                editable={isEditing}
                edge={selectedEdge}
                nodes={activeDefinition.nodes}
                onChange={updateSelectedEdge}
                onDelete={deleteSelectedEdge}
              />
            </CardContent>
          </Card>
        ) : selectedNode ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{humanizeIdentifier(selectedNode.type)}</Badge>
                  <span className="truncate text-sm font-semibold">{selectedNode.name}</span>
                  {selectedNodeIssues.length > 0 ? <Badge variant="danger">Needs attention</Badge> : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{selectedNode.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isEditing ? (
                  <Button variant="outline" onClick={() => openNodeEditor(selectedNode.id)}>
                    <Pencil />
                    Edit node
                  </Button>
                ) : (
                  <Button variant="outline" disabled={!canEditWorkflow} onClick={() => openNodeEditor(selectedNode.id)}>
                    <Pencil />
                    Edit node
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <NodeEditorDialog
        editable={isEditing}
        node={nodeEditorNode}
        open={Boolean(nodeEditorNode)}
        validationMessages={
          activeDefinition && nodeEditorNode ? getNodeDefinitionIssueMessages(activeDefinition, nodeEditorNode.id) : []
        }
        onChange={updateNode}
        onClose={() => setNodeEditorNodeId(undefined)}
        onDelete={() => {
          if (nodeEditorNode) {
            deleteNode(nodeEditorNode.id);
          }
        }}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent executions</CardTitle>
            <CardDescription>Latest worker runs for this workflow.</CardDescription>
          </div>
          <Clock3 className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {executionsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executionsQuery.data && executionsQuery.data.length > 0 ? (
                  executionsQuery.data.slice(0, 6).map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell>
                        <StatusBadge status={execution.status} />
                      </TableCell>
                      <TableCell>{formatDateTime(execution.createdAt)}</TableCell>
                      <TableCell>{formatDuration(execution.startedAt, execution.completedAt)}</TableCell>
                      <TableCell>{formatDateTime(execution.completedAt)}</TableCell>
                      <TableCell>
                        <Button asChild size="icon" variant="ghost" aria-label="Open execution">
                          <Link
                            to={`/app/workspaces/${workspaceId}/workflows/${workflowId}/executions/${execution.id}`}
                          >
                            <ArrowRight />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No executions yet. Run this workflow to create the first trace.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AddNodeMenu({ onAddNode }: { onAddNode: (type: WorkflowNodeType) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Add node" className="liquid-glass shadow-md" size="icon" variant="outline">
          <Plus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>
          <span className="block">Add node</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Choose a node type to place on the canvas.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NODE_LIBRARY.map((nodeOption) => {
          const Icon = nodeOption.icon;

          return (
            <DropdownMenuItem
              key={nodeOption.type}
              className="cursor-pointer items-start gap-3 p-3"
              onSelect={() => onAddNode(nodeOption.type)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{nodeOption.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {nodeOption.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeEditorDialog({
  editable,
  node,
  open,
  validationMessages,
  onChange,
  onClose,
  onDelete
}: {
  editable: boolean;
  node: WorkflowNode | undefined;
  open: boolean;
  validationMessages: string[];
  onChange: (node: WorkflowNode) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className="workflow-node-editor-dialog !flex w-[min(calc(100vw-2rem),46rem)] flex-col gap-0 !overflow-hidden p-0">
        {node ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">{humanizeIdentifier(node.type)}</Badge>
                <Badge variant="outline">{node.id}</Badge>
              </div>
              <DialogTitle className="mt-2">{node.name}</DialogTitle>
              <DialogDescription>{getNodeRuntimeDescription(node.type)}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-5">
              <NodeInspector
                editable={editable}
                node={node}
                showIdentity={false}
                validationMessages={validationMessages}
                onChange={onChange}
                onDelete={onDelete}
              />
            </div>
            <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NodeInspector({
  editable,
  node,
  showIdentity = true,
  validationMessages,
  onChange,
  onDelete
}: {
  editable: boolean;
  node: WorkflowNode;
  showIdentity?: boolean;
  validationMessages: string[];
  onChange: (node: WorkflowNode) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div>
        {editable ? (
          <div className="space-y-2">
            <Label htmlFor="node-name">Name</Label>
            <Input
              id="node-name"
              value={node.name}
              onChange={(event) => onChange({ ...node, name: event.target.value })}
            />
          </div>
        ) : (
          <p className="text-sm font-medium">{node.name}</p>
        )}
        {showIdentity ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="info">{humanizeIdentifier(node.type)}</Badge>
            <Badge variant="outline">{node.id}</Badge>
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Runtime role</p>
        <p className="mt-1 text-sm">{getNodeRuntimeDescription(node.type)}</p>
      </div>
      {editable ? <NodeConfigEditor node={node} onChange={onChange} /> : <JsonBlock value={node.config} />}
      {validationMessages.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      {editable ? (
        <Button variant="outline" className="w-full justify-center" onClick={onDelete}>
          <Trash2 />
          Delete node
        </Button>
      ) : null}
    </>
  );
}

function EdgeInspector({
  editable,
  edge,
  nodes,
  onChange,
  onDelete
}: {
  editable: boolean;
  edge: WorkflowDefinition["edges"][number];
  nodes: WorkflowNode[];
  onChange: (sourceNodeId: string, targetNodeId: string) => void;
  onDelete: () => void;
}) {
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const target = nodes.find((node) => node.id === edge.targetNodeId);

  return (
    <>
      {editable ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edge-source">Source</Label>
            <NodeSelect
              id="edge-source"
              ariaLabel="Selected edge source"
              nodes={nodes}
              value={edge.sourceNodeId}
              onChange={(sourceNodeId) => onChange(sourceNodeId, edge.targetNodeId)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edge-target">Target</Label>
            <NodeSelect
              id="edge-target"
              ariaLabel="Selected edge target"
              nodes={nodes}
              value={edge.targetNodeId}
              onChange={(targetNodeId) => onChange(edge.sourceNodeId, targetNodeId)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Source</p>
            <p className="mt-1 text-sm">{source?.name ?? edge.sourceNodeId}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Target</p>
            <p className="mt-1 text-sm">{target?.name ?? edge.targetNodeId}</p>
          </div>
        </div>
      )}
      <div className="min-w-0">
        <JsonBlock value={edge} />
      </div>
      {editable ? (
        <Button variant="outline" className="w-full justify-center" onClick={onDelete}>
          <Trash2 />
          Delete edge
        </Button>
      ) : null}
    </>
  );
}

function NodeSelect({
  ariaLabel,
  className,
  id,
  nodes,
  placeholder,
  value,
  onChange
}: {
  ariaLabel: string;
  className?: string;
  id?: string;
  nodes: WorkflowNode[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={cn("liquid-field h-9 rounded-md border border-input bg-card px-3 text-sm", className)}
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {nodes.map((node) => (
        <option key={node.id} value={node.id}>
          {node.name}
        </option>
      ))}
    </select>
  );
}

function NodeConfigEditor({
  node,
  onChange
}: {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
}) {
  const { workspaceId = "" } = useParams();
  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(workspaceId),
    queryFn: () => listCredentials(workspaceId),
    enabled: Boolean(workspaceId) && node.type === WORKFLOW_NODE_TYPES.aiPromptAction
  });

  if (node.type === WORKFLOW_NODE_TYPES.manualTrigger) {
    return <JsonBlock value={node.config} />;
  }

  if (node.type === WORKFLOW_NODE_TYPES.transformAction) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="transform-mode">Mode</Label>
          <select
            id="transform-mode"
            className="liquid-field h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={node.config.mode}
            onChange={(event) =>
              onChange({
                ...node,
                config:
                  event.target.value === "pick"
                    ? { mode: "pick", pick: node.config.pick ?? ["leadId"] }
                    : { mode: "passthrough" }
              })
            }
          >
            <option value="passthrough">Passthrough</option>
            <option value="pick">Pick fields</option>
          </select>
        </div>
        {node.config.mode === "pick" ? (
          <div className="space-y-2">
            <Label htmlFor="transform-pick">Pick fields</Label>
            <Input
              id="transform-pick"
              value={node.config.pick?.join(", ") ?? ""}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    mode: "pick",
                    pick: event.target.value
                      .split(",")
                      .map((field) => field.trim())
                      .filter(Boolean)
                  }
                })
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (node.type === WORKFLOW_NODE_TYPES.conditionAction) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="condition-field">Field</Label>
          <Input
            id="condition-field"
            value={node.config.field}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  field: event.target.value
                }
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="condition-operator">Operator</Label>
          <select
            id="condition-operator"
            className="liquid-field h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={node.config.operator}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  operator: event.target.value as (typeof WORKFLOW_CONDITION_OPERATORS)[number]
                }
              })
            }
          >
            {WORKFLOW_CONDITION_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {humanizeIdentifier(operator)}
              </option>
            ))}
          </select>
        </div>
        {node.config.operator !== "exists" ? (
          <div className="space-y-2">
            <Label htmlFor="condition-value">Value</Label>
            <Input
              id="condition-value"
              value={String(node.config.value ?? "")}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    value: event.target.value
                  }
                })
              }
            />
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="condition-true-label">True label</Label>
            <Input
              id="condition-true-label"
              value={node.config.trueLabel}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    trueLabel: event.target.value
                  }
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition-false-label">False label</Label>
            <Input
              id="condition-false-label"
              value={node.config.falseLabel}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    falseLabel: event.target.value
                  }
                })
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (node.type === WORKFLOW_NODE_TYPES.httpRequestAction) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="http-mode">Mode</Label>
          <select
            id="http-mode"
            className="liquid-field h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={node.config.mode ?? "mock"}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  mode: event.target.value as "mock" | "real"
                }
              })
            }
          >
            <option value="mock">Mock response</option>
            <option value="real">Real request</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="http-method">Method</Label>
          <select
            id="http-method"
            className="liquid-field h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={node.config.method}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  method: event.target.value as (typeof WORKFLOW_HTTP_METHODS)[number]
                }
              })
            }
          >
            {WORKFLOW_HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="http-url">URL</Label>
          <Input
            id="http-url"
            value={node.config.url}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  url: event.target.value
                }
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="http-timeout">Timeout ms</Label>
          <Input
            id="http-timeout"
            type="number"
            min="100"
            max="30000"
            step="100"
            value={node.config.timeoutMs ?? 5000}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  timeoutMs: Number(event.target.value)
                }
              })
            }
          />
        </div>
        <HttpBodyJsonEditor node={node} onChange={onChange} />
      </div>
    );
  }

  if (node.type === WORKFLOW_NODE_TYPES.aiPromptAction) {
    const providerOption = getAiProviderOption(node.config.provider);
    const providerCredentials = getCompatibleAiCredentials(
      credentialsQuery.data ?? [],
      node.config.provider
    );
    const selectedCredentialIsCompatible =
      node.config.credentialId === undefined ||
      providerCredentials.some((credential) => credential.id === node.config.credentialId);

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          AI prompts use provider-specific credentials. Only credentials with matching provider,
          kind <Badge variant="secondary">llm</Badge>, and capability{" "}
          <Badge variant="outline">llm.chat</Badge> appear here.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt-provider">Provider</Label>
            <select
              className="liquid-field h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              id="ai-prompt-provider"
              value={node.config.provider}
              onChange={(event) => {
                const nextProvider = event.target.value;
                const nextProviderOption = getAiProviderOption(nextProvider);

                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    credentialId: undefined,
                    model: nextProviderOption.model,
                    provider: nextProvider
                  }
                });
              }}
            >
              {AI_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-prompt-model">Model</Label>
            <Input
              id="ai-prompt-model"
              value={node.config.model}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    model: event.target.value
                  }
                })
              }
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt-credential">Credential</Label>
            <select
              className="liquid-field h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              disabled={!providerOption.credentialRequired || credentialsQuery.isLoading}
              id="ai-prompt-credential"
              value={selectedCredentialIsCompatible ? node.config.credentialId ?? "" : ""}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    credentialId: event.target.value || undefined
                  }
                })
              }
            >
              <option value="">
                {!providerOption.credentialRequired
                  ? "No credential required"
                  : credentialsQuery.isLoading
                    ? "Loading credentials"
                    : "Select compatible credential"}
              </option>
              {providerCredentials.map((credential) => (
                <option key={credential.id} value={credential.id}>
                  {credential.name}
                </option>
              ))}
            </select>
            {providerOption.credentialRequired && providerCredentials.length === 0 ? (
              <p className="text-xs text-amber-300">
                No compatible {providerOption.label} LLM credential found. Add one in Credentials.
              </p>
            ) : null}
            {!selectedCredentialIsCompatible ? (
              <p className="text-xs text-amber-300">
                The saved credential no longer matches this provider and will not be used.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-prompt-temperature">Temperature</Label>
            <Input
              id="ai-prompt-temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={node.config.temperature}
              onChange={(event) =>
                onChange({
                  ...node,
                  config: {
                    ...node.config,
                    temperature: Number(event.target.value)
                  }
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-system-prompt">System prompt</Label>
          <Textarea
            className="min-h-24"
            id="ai-system-prompt"
            value={node.config.systemPrompt ?? ""}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  systemPrompt: event.target.value || undefined
                }
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-prompt">Prompt</Label>
          <Textarea
            className="min-h-32"
            id="ai-prompt"
            value={node.config.prompt}
            onChange={(event) =>
              onChange({
                ...node,
                config: {
                  ...node.config,
                  prompt: event.target.value
                }
              })
            }
          />
        </div>
      </div>
    );
  }

  return null;
}

function HttpBodyJsonEditor({
  node,
  onChange
}: {
  node: Extract<WorkflowNode, { type: typeof WORKFLOW_NODE_TYPES.httpRequestAction }>;
  onChange: (node: WorkflowNode) => void;
}) {
  const [bodyJson, setBodyJson] = useState(() => JSON.stringify(node.config.body ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string>();

  useEffect(() => {
    setBodyJson(JSON.stringify(node.config.body ?? {}, null, 2));
    setJsonError(undefined);
  }, [node.id, node.config.body]);

  return (
    <div className="space-y-2">
      <Label htmlFor="http-body">Body JSON</Label>
      <Textarea
        id="http-body"
        value={bodyJson}
        onChange={(event) => {
          const nextValue = event.target.value;
          setBodyJson(nextValue);

          const parsedBody = parseJsonObject(nextValue);
          if (!parsedBody) {
            setJsonError("Body must be a valid JSON object.");
            return;
          }

          setJsonError(undefined);
          onChange({
            ...node,
            config: {
              ...node.config,
              body: parsedBody
            }
          });
        }}
      />
      {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : null}
    </div>
  );
}

function WorkflowMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof PlayCircle;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-border px-4 py-3 md:border-r md:last:border-r-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold leading-tight">{value}</p>
      </div>
    </div>
  );
}

function getNodeRuntimeDescription(type: string) {
  return getNodeCatalogEntry(type)?.runtimeDescription ?? "Runs as part of the workflow execution graph.";
}

function cloneDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    nodes: definition.nodes.map((node) => ({
      ...node,
      config: { ...node.config }
    })) as WorkflowDefinition["nodes"],
    edges: definition.edges.map((edge) => ({ ...edge }))
  };
}

function areDefinitionsEqual(left: WorkflowDefinition, right: WorkflowDefinition) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getUniqueEdgeId(baseId: string, definition: WorkflowDefinition, ignoredEdgeId?: string) {
  const existingIds = new Set(
    definition.edges.filter((edge) => edge.id !== ignoredEdgeId).map((edge) => edge.id)
  );

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getAiProviderOption(provider: string) {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === provider) ?? AI_PROVIDER_OPTIONS[0];
}

function getCompatibleAiCredentials(credentials: IntegrationCredential[], provider: string) {
  if (provider === "deterministic") {
    return [];
  }

  return credentials.filter(
    (credential) =>
      credential.type === provider &&
      credential.kind === "llm" &&
      credential.capabilities.includes("llm.chat")
  );
}

function canWriteWorkflows(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}
