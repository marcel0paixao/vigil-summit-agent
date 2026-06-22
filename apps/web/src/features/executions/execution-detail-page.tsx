import { WORKFLOW_NODE_TYPES } from "@flowpilot/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Clock3,
  DollarSign,
  Eye,
  GitBranch,
  ListChecks,
  RadioTower
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { queryKeys } from "@/shared/api/query-keys";
import type {
  WorkflowAiTrace,
  WorkflowExecutionDiagnostics,
  WorkflowExecutionEvent,
  WorkflowExecutionSummary,
  WorkflowNodeExecution
} from "@/shared/api/types";
import { getExecutionDiagnostics, getExecutionSummary } from "@/shared/api/workflows";
import { formatDateTime, formatDuration, humanizeIdentifier, isTerminalExecutionStatus } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { JsonBlock } from "@/shared/ui/json-block";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

type ExecutionDetailTab = "nodes" | "ai" | "data" | "timeline" | "diagnostics";

export function ExecutionDetailPage() {
  const { workspaceId = "", workflowId = "", executionId = "" } = useParams();
  const [selectedNode, setSelectedNode] = useState<WorkflowNodeExecution | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WorkflowExecutionEvent | null>(null);
  const [activeTab, setActiveTab] = useState<ExecutionDetailTab>("nodes");
  const summaryQuery = useQuery({
    queryKey: queryKeys.executionSummary(workspaceId, workflowId, executionId),
    queryFn: () => getExecutionSummary(workspaceId, workflowId, executionId),
    enabled: Boolean(workspaceId && workflowId && executionId),
    refetchInterval: (query) => {
      const data = query.state.data as WorkflowExecutionSummary | undefined;

      return data && !isTerminalExecutionStatus(data.execution.status) ? 2_000 : false;
    }
  });
  const diagnosticsQuery = useQuery({
    queryKey: queryKeys.executionDiagnostics(workspaceId, workflowId, executionId),
    queryFn: () => getExecutionDiagnostics(workspaceId, workflowId, executionId),
    enabled: Boolean(workspaceId && workflowId && executionId)
  });

  if (summaryQuery.isError) {
    return (
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
        <ErrorState
          title="Execution summary could not be loaded"
          message={summaryQuery.error instanceof Error ? summaryQuery.error.message : undefined}
          onRetry={() => void summaryQuery.refetch()}
        />
      </section>
    );
  }

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return (
      <section className="grid gap-6 p-4 lg:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  const summary = summaryQuery.data;
  const succeededNodes = summary.nodes.filter((node) => node.status === "SUCCEEDED").length;
  const failedNodes = summary.nodes.filter((node) => node.status === "FAILED").length;
  const totalTokens = summary.aiTraces.reduce((total, trace) => total + trace.totalTokenCount, 0);
  const estimatedCost = sumEstimatedCost(summary.aiTraces);
  const isLive = !isTerminalExecutionStatus(summary.execution.status);
  const orderedEvents = [...summary.events].sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
  );

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-normal">Execution Detail</h1>
            <StatusBadge status={summary.execution.status} />
            {isLive ? <Badge variant="info">Polling every 2s</Badge> : null}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{summary.execution.id}</p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/app/workspaces/${workspaceId}/workflows/${workflowId}`}>Workflow</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard icon={GitBranch} label="Total nodes" value={String(summary.nodes.length)} />
        <MetricCard icon={Activity} label="Successful nodes" value={String(succeededNodes)} />
        <MetricCard icon={AlertTriangle} label="Failed nodes" value={String(failedNodes)} />
        <MetricCard icon={BrainCircuit} label="AI traces" value={String(summary.aiTraces.length)} />
        <MetricCard icon={ListChecks} label="Total tokens" value={formatInteger(totalTokens)} />
        <MetricCard icon={DollarSign} label="Estimated cost" value={formatUsd(estimatedCost)} />
        <MetricCard
          icon={Clock3}
          label="Total latency"
          value={formatDuration(summary.execution.startedAt, summary.execution.completedAt)}
        />
      </div>

      <ExecutionDetailTabs activeTab={activeTab} summary={summary} onSelectTab={setActiveTab} />

      {activeTab === "nodes" ? (
        <NodeProgressCard nodes={summary.nodes} onSelectNode={setSelectedNode} />
      ) : null}

      {activeTab === "ai" ? <AiObservabilityCard summary={summary} /> : null}

      {activeTab === "data" ? <ExecutionDataCard summary={summary} /> : null}

      {activeTab === "timeline" ? (
        <TimelineCard events={orderedEvents} onSelectEvent={setSelectedEvent} />
      ) : null}

      {activeTab === "diagnostics" ? <DiagnosticsCard diagnosticsQuery={diagnosticsQuery} /> : null}

      <NodeExecutionDetailsDialog node={selectedNode} onClose={() => setSelectedNode(null)} />
      <TimelineEventDetailsDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </section>
  );
}

function ExecutionDetailTabs({
  activeTab,
  summary,
  onSelectTab
}: {
  activeTab: ExecutionDetailTab;
  summary: WorkflowExecutionSummary;
  onSelectTab: (tab: ExecutionDetailTab) => void;
}) {
  const tabs: Array<{ id: ExecutionDetailTab; label: string; count?: number }> = [
    { id: "nodes", label: "Nodes", count: summary.nodes.length },
    { id: "ai", label: "AI traces", count: summary.aiTraces.length },
    { id: "data", label: "Data" },
    { id: "timeline", label: "Timeline", count: summary.events.length },
    { id: "diagnostics", label: "Diagnostics" }
  ];

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2">
      {tabs.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <Button
            key={tab.id}
            aria-pressed={selected}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined ? <Badge variant="outline">{tab.count}</Badge> : null}
          </Button>
        );
      })}
    </div>
  );
}

function NodeProgressCard({
  nodes,
  onSelectNode
}: {
  nodes: WorkflowNodeExecution[];
  onSelectNode: (node: WorkflowNodeExecution) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <CardHeader>
        <CardTitle>Node progress</CardTitle>
        <CardDescription>Status by executed workflow node.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <TableRow key={node.id} className="cursor-pointer" onClick={() => onSelectNode(node)}>
                  <TableCell className="min-w-0">
                    <div className="font-medium">{node.nodeId}</div>
                    <div className="mt-1 max-w-72 truncate text-xs text-muted-foreground">{node.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanizeIdentifier(node.nodeType)}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={node.status} />
                  </TableCell>
                  <TableCell>{formatDateTime(node.startedAt)}</TableCell>
                  <TableCell>{formatDuration(node.startedAt, node.completedAt)}</TableCell>
                  <TableCell>{formatDateTime(node.completedAt)}</TableCell>
                  <TableCell>
                    <Button
                      aria-label={`Open details for ${node.nodeId}`}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectNode(node);
                      }}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Node progress has not been persisted for this execution yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AiObservabilityCard({ summary }: { summary: WorkflowExecutionSummary }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const providers = Array.from(new Set(summary.aiTraces.map((trace) => trace.provider))).sort();
  const models = Array.from(new Set(summary.aiTraces.map((trace) => trace.model))).sort();
  const filteredTraces = summary.aiTraces.filter((trace) => {
    const statusMatches = statusFilter === "all" || trace.status === statusFilter;
    const providerMatches = providerFilter === "all" || trace.provider === providerFilter;
    const modelMatches = modelFilter === "all" || trace.model === modelFilter;

    return statusMatches && providerMatches && modelMatches;
  });
  const traceSummary = buildAiTraceSummary(filteredTraces);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>AI observability</CardTitle>
        <CardDescription>
          {filteredTraces.length} of {summary.aiTraces.length} structured traces captured from AI
          prompt node executions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.aiTraces.length > 0 ? (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <DetailMetric label="AI calls" value={String(traceSummary.calls)} />
              <DetailMetric label="Tokens" value={formatInteger(traceSummary.tokens)} />
              <DetailMetric label="Provider latency" value={`${formatInteger(traceSummary.providerLatencyMs)}ms`} />
              <DetailMetric label="Estimated cost" value={formatUsd(traceSummary.estimatedCost)} />
            </div>

            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {traceSummary.calls} AI {traceSummary.calls === 1 ? "call" : "calls"},{" "}
              {formatInteger(traceSummary.tokens)} tokens,{" "}
              {formatInteger(traceSummary.providerLatencyMs)}ms provider latency.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <TraceFilterSelect
                label="Status"
                value={statusFilter}
                options={[
                  { label: "All statuses", value: "all" },
                  { label: "Succeeded", value: "SUCCEEDED" },
                  { label: "Failed", value: "FAILED" }
                ]}
                onChange={setStatusFilter}
              />
              <TraceFilterSelect
                label="Provider"
                value={providerFilter}
                options={[
                  { label: "All providers", value: "all" },
                  ...providers.map((provider) => ({
                    label: humanizeIdentifier(provider),
                    value: provider
                  }))
                ]}
                onChange={setProviderFilter}
              />
              <TraceFilterSelect
                label="Model"
                value={modelFilter}
                options={[
                  { label: "All models", value: "all" },
                  ...models.map((model) => ({
                    label: model,
                    value: model
                  }))
                ]}
                onChange={setModelFilter}
              />
            </div>

            {filteredTraces.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Node</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Finish</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTraces.map((trace) => (
                      <TableRow key={trace.id}>
                        <TableCell>
                          <div className="font-medium">{trace.nodeId ?? "-"}</div>
                          <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                            {trace.id}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{humanizeIdentifier(trace.provider)}</div>
                          <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                            {trace.model}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={trace.status} />
                        </TableCell>
                        <TableCell>
                          <div>{formatInteger(trace.latencyMs)}ms</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Provider{" "}
                            {trace.providerLatencyMs !== null
                              ? `${formatInteger(trace.providerLatencyMs)}ms`
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{formatInteger(trace.totalTokenCount)} total</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatInteger(trace.inputTokenCount)} in ·{" "}
                            {formatInteger(trace.outputTokenCount)} out
                          </div>
                        </TableCell>
                        <TableCell>{formatUsd(parseEstimatedCost(trace.estimatedCostUsd))}</TableCell>
                        <TableCell>{trace.finishReason ? humanizeIdentifier(trace.finishReason) : "-"}</TableCell>
                        <TableCell>
                          {trace.errorCode !== null ? (
                            <div>
                              <div className="font-medium">{humanizeIdentifier(trace.errorCode)}</div>
                              <div className="mt-1 max-w-72 break-words text-xs text-muted-foreground">
                                {trace.errorMessage ?? "-"}
                              </div>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No AI traces match the selected filters.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No AI traces have been recorded for this execution yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TraceFilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        className="h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExecutionDataCard({ summary }: { summary: WorkflowExecutionSummary }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Execution data</CardTitle>
        <CardDescription>{formatDateTime(summary.execution.createdAt)}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium">Input</p>
          <JsonBlock className="max-h-[26rem]" value={summary.execution.input} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium">Output</p>
          <JsonBlock className="max-h-[26rem]" value={summary.execution.output} />
        </div>
        {summary.execution.error ? (
          <div className="min-w-0 lg:col-span-2">
            <p className="mb-2 text-sm font-medium">Error</p>
            <JsonBlock className="max-h-[22rem]" value={summary.execution.error} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  events,
  onSelectEvent
}: {
  events: WorkflowExecutionEvent[];
  onSelectEvent: (event: WorkflowExecutionEvent) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>Persisted workflow and node lifecycle events.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.length > 0 ? (
            events.map((event, index) => (
              <button
                key={event.id}
                className="relative w-full min-w-0 cursor-pointer overflow-hidden rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={() => onSelectEvent(event)}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{humanizeIdentifier(event.eventName)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.producer} · {formatDateTime(event.occurredAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{event.eventId.slice(0, 8)}</Badge>
                </div>
                <p className="mt-3 max-h-10 overflow-hidden break-words text-xs leading-5 text-muted-foreground">
                  {createPayloadPreview(event.payload)}
                </p>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Timeline events have not arrived yet. Running executions will keep polling.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DiagnosticsCard({
  diagnosticsQuery
}: {
  diagnosticsQuery: {
    data?: WorkflowExecutionDiagnostics;
    isLoading: boolean;
  };
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Retry & DLQ</CardTitle>
          <CardDescription>Operational failure state derived from persisted execution data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {diagnosticsQuery.isLoading ? (
            <>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </>
          ) : diagnosticsQuery.data ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <RadioTower className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Retry attempts</span>
                </div>
                <Badge variant={diagnosticsQuery.data.retry.attempts > 0 ? "warning" : "outline"}>
                  {diagnosticsQuery.data.retry.attempts}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Dead-lettered</span>
                </div>
                <Badge variant={diagnosticsQuery.data.retry.deadLettered ? "danger" : "success"}>
                  {diagnosticsQuery.data.retry.deadLettered ? "Yes" : "No"}
                </Badge>
              </div>
              {diagnosticsQuery.data.retry.lastFailureMessage ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {diagnosticsQuery.data.retry.lastFailureCode ?? "Last failure"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {diagnosticsQuery.data.retry.lastFailureMessage}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Diagnostics are not available.</p>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-x-auto">
        <CardHeader>
          <CardTitle>Outbox dispatch</CardTitle>
          <CardDescription>Lifecycle events persisted before RabbitMQ publish.</CardDescription>
        </CardHeader>
        <CardContent>
          {diagnosticsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : diagnosticsQuery.data && diagnosticsQuery.data.outbox.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnosticsQuery.data.outbox.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell>
                      <div className="font-medium">{humanizeIdentifier(message.eventName)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{message.routingKey}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={message.status} />
                    </TableCell>
                    <TableCell>{message.attempts}</TableCell>
                    <TableCell>{formatDateTime(message.publishedAt)}</TableCell>
                    <TableCell>{message.lastError ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No outbox messages are associated with this execution yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function buildAiTraceSummary(traces: WorkflowAiTrace[]) {
  return traces.reduce(
    (summary, trace) => ({
      calls: summary.calls + 1,
      estimatedCost: summary.estimatedCost + parseEstimatedCost(trace.estimatedCostUsd),
      providerLatencyMs: summary.providerLatencyMs + (trace.providerLatencyMs ?? 0),
      tokens: summary.tokens + trace.totalTokenCount
    }),
    {
      calls: 0,
      estimatedCost: 0,
      providerLatencyMs: 0,
      tokens: 0
    }
  );
}

function sumEstimatedCost(traces: WorkflowAiTrace[]): number {
  return traces.reduce(
    (total, trace) => total + parseEstimatedCost(trace.estimatedCostUsd),
    0
  );
}

function parseEstimatedCost(value: string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value: number): string {
  if (value === 0) {
    return "$0";
  }

  if (value < 0.01) {
    return `<$0.01`;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency"
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

function AiProviderErrorNotice({ error }: { error: unknown }) {
  const details = getAiProviderErrorDetails(error);

  if (!details) {
    return null;
  }

  return (
    <div className="rounded-md border border-amber-300/40 bg-amber-500/10 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{details.provider ?? "AI provider"}</Badge>
        {details.status !== undefined ? <Badge variant="outline">HTTP {details.status}</Badge> : null}
        {details.retryable === false ? <Badge variant="outline">No auto retry</Badge> : null}
      </div>
      <p className="mt-2 font-medium text-foreground">{details.title}</p>
      {details.message !== undefined ? (
        <p className="mt-1 text-muted-foreground">{details.message}</p>
      ) : null}
    </div>
  );
}

function NodeExecutionDetailsDialog({
  node,
  onClose
}: {
  node: WorkflowNodeExecution | null;
  onClose: () => void;
}) {
  if (!node) {
    return null;
  }

  return (
    <Dialog open={node !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="workflow-node-editor-dialog !flex w-[min(calc(100vw-2rem),52rem)] flex-col gap-0 !overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{humanizeIdentifier(node.nodeType)}</Badge>
            <StatusBadge status={node.status} />
          </div>
          <DialogTitle className="mt-2">{node.nodeId}</DialogTitle>
          <DialogDescription>{node.id}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Started" value={formatDateTime(node.startedAt)} />
            <DetailMetric label="Duration" value={formatDuration(node.startedAt, node.completedAt)} />
            <DetailMetric label="Completed" value={formatDateTime(node.completedAt)} />
          </div>

          {node.nodeType === WORKFLOW_NODE_TYPES.aiPromptAction && node.error ? (
            <AiProviderErrorNotice error={node.error} />
          ) : null}

          {node.error ? (
            <div className="min-w-0">
              <p className="mb-2 text-sm font-medium">Failure details</p>
              <JsonBlock value={node.error} />
            </div>
          ) : (
            <div className="min-w-0">
              <p className="mb-2 text-sm font-medium">Output</p>
              <JsonBlock value={node.output} />
            </div>
          )}

          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">Input</p>
            <JsonBlock value={node.input} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimelineEventDetailsDialog({
  event,
  onClose
}: {
  event: WorkflowExecutionEvent | null;
  onClose: () => void;
}) {
  if (!event) {
    return null;
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="workflow-node-editor-dialog !flex w-[min(calc(100vw-2rem),52rem)] flex-col gap-0 !overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{event.eventId.slice(0, 8)}</Badge>
            <Badge variant="outline">{event.producer}</Badge>
          </div>
          <DialogTitle className="mt-2">{humanizeIdentifier(event.eventName)}</DialogTitle>
          <DialogDescription>{formatDateTime(event.occurredAt)}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailMetric label="Event ID" value={event.eventId} />
            <DetailMetric label="Producer" value={event.producer} />
            <DetailMetric label="Created" value={formatDateTime(event.createdAt)} />
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">Payload</p>
            <JsonBlock value={event.payload} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function createPayloadPreview(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function getAiProviderErrorDetails(error: unknown) {
  const errorRecord = asRecord(error);
  const cause = asRecord(errorRecord?.cause);
  const responseBody = asRecord(cause?.responseBody);
  const detail = asRecord(responseBody?.detail);

  if (detail?.code !== "ai_provider_error") {
    return null;
  }

  const providerError = asRecord(detail.providerError);
  const providerErrorBody = asRecord(providerError?.error);
  const metadata = asRecord(providerErrorBody?.metadata);
  const rawProviderMessage = typeof metadata?.raw === "string" ? metadata.raw : undefined;
  const providerMessage =
    rawProviderMessage ??
    (typeof providerErrorBody?.message === "string" ? providerErrorBody.message : undefined);
  const status = typeof detail.status === "number" ? detail.status : undefined;
  const provider = typeof detail.provider === "string" ? humanizeIdentifier(detail.provider) : undefined;
  const retryable = typeof errorRecord?.retryable === "boolean" ? errorRecord.retryable : undefined;

  return {
    provider,
    retryable,
    status,
    title:
      status === 429
        ? "The selected AI provider is rate-limited right now."
        : "The selected AI provider rejected this request.",
    message:
      providerMessage ??
      (typeof detail.message === "string" ? detail.message : undefined) ??
      (typeof errorRecord?.message === "string" ? errorRecord.message : undefined)
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
