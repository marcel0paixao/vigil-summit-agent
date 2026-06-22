import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { queryKeys } from "@/shared/api/query-keys";
import type { Workflow, WorkflowExecution } from "@/shared/api/types";
import { listWorkflowExecutions, listWorkflows } from "@/shared/api/workflows";
import { formatDateTime } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

interface ExecutionRow {
  workflow: Workflow;
  execution: WorkflowExecution;
}

export function ExecutionsPage() {
  const { workspaceId = "" } = useParams();
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows(workspaceId),
    queryFn: () => listWorkflows(workspaceId),
    enabled: Boolean(workspaceId)
  });
  const executionQueries = useQueries({
    queries:
      workflowsQuery.data?.map((workflow) => ({
        queryKey: queryKeys.workflowExecutions(workspaceId, workflow.id),
        queryFn: () => listWorkflowExecutions(workspaceId, workflow.id),
        enabled: Boolean(workspaceId)
      })) ?? []
  });
  const rows: ExecutionRow[] =
    workflowsQuery.data
      ?.flatMap((workflow, index) =>
        (executionQueries[index]?.data ?? []).map((execution) => ({
          workflow,
          execution
        }))
      )
      .sort((left, right) => right.execution.createdAt.localeCompare(left.execution.createdAt)) ?? [];
  const loading = workflowsQuery.isLoading || executionQueries.some((query) => query.isLoading);
  const failedExecutionQuery = executionQueries.find((query) => query.isError);

  if (workflowsQuery.isError) {
    return (
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
        <ErrorState
          title="Executions could not be loaded"
          message={workflowsQuery.error instanceof Error ? workflowsQuery.error.message : undefined}
          onRetry={() => void workflowsQuery.refetch()}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Executions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Recent runs across workspace workflows.</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent executions</CardTitle>
            <CardDescription>Worker status, timestamps, and workflow source.</CardDescription>
          </div>
          <Clock3 className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {failedExecutionQuery ? (
            <ErrorState
              title="Some execution rows could not be loaded"
              message={failedExecutionQuery.error instanceof Error ? failedExecutionQuery.error.message : undefined}
              onRetry={() => void failedExecutionQuery.refetch()}
            />
          ) : null}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : failedExecutionQuery ? null : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ workflow, execution }) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      <div className="font-medium">{workflow.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{execution.id}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={execution.status} />
                    </TableCell>
                    <TableCell>{formatDateTime(execution.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(execution.completedAt)}</TableCell>
                    <TableCell>
                      <Button asChild size="icon" variant="ghost" aria-label="Open execution">
                        <Link
                          to={`/app/workspaces/${workspaceId}/workflows/${workflow.id}/executions/${execution.id}`}
                        >
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No executions yet.</div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
