import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus, Workflow as WorkflowIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "@/features/auth/auth-provider";
import { RunWorkflowButton } from "@/features/workflows/run-workflow-button";
import { ApiError } from "@/shared/api/http";
import { queryKeys } from "@/shared/api/query-keys";
import type { Workflow } from "@/shared/api/types";
import { createWorkflow, listWorkflowExecutions, listWorkflows } from "@/shared/api/workflows";
import { formatDateTime, formatRelative, slugify } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { ErrorState } from "@/shared/ui/error-state";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";

const createWorkflowSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  description: z.string().max(400).optional()
});

type CreateWorkflowForm = z.infer<typeof createWorkflowSchema>;

export function WorkflowsPage() {
  const { workspaceId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows(workspaceId),
    queryFn: () => listWorkflows(workspaceId),
    enabled: Boolean(workspaceId)
  });
  const currentMembership = user?.memberships.find((membership) => membership.workspace.id === workspaceId);
  const canEditWorkflows = currentMembership ? canWriteWorkflows(currentMembership.role) : false;
  const form = useForm<CreateWorkflowForm>({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: ""
    }
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateWorkflowForm) =>
      createWorkflow(workspaceId, {
        ...values,
        description: values.description || undefined
      }),
    onSuccess: async (workflow) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workflows(workspaceId) });
      setOpen(false);
      form.reset();
      navigate(`/app/workspaces/${workspaceId}/workflows/${workflow.id}`);
    }
  });

  async function onSubmit(values: CreateWorkflowForm) {
    form.clearErrors("root");

    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      form.setError("root", {
        message: error instanceof ApiError ? error.message : "Workflow creation failed"
      });
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Workflows</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drafts and runnable automations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canEditWorkflows}>
              <Plus />
              New workflow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create workflow</DialogTitle>
              <DialogDescription>New workflows start with a valid manual trigger.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Name</Label>
                <Input
                  id="workflow-name"
                  {...form.register("name", {
                    onBlur: (event) => {
                      if (!form.getValues("slug")) {
                        form.setValue("slug", slugify(event.target.value), { shouldValidate: true });
                      }
                    }
                  })}
                />
                {form.formState.errors.name ? (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-slug">Slug</Label>
                <Input id="workflow-slug" {...form.register("slug")} />
                {form.formState.errors.slug ? (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description</Label>
                <Textarea id="workflow-description" {...form.register("description")} />
              </div>
              {form.formState.errors.root?.message ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {workflowsQuery.isError ? (
        <ErrorState
          title="Workflows could not be loaded"
          message={workflowsQuery.error instanceof Error ? workflowsQuery.error.message : undefined}
          onRetry={() => void workflowsQuery.refetch()}
        />
      ) : null}

      {workflowsQuery.isLoading ? <WorkflowsSkeleton /> : null}

      {workflowsQuery.data && workflowsQuery.data.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <WorkflowIcon className="size-5" />
            </div>
            <CardTitle>No workflows yet</CardTitle>
            <CardDescription>Create a workflow and run it through the execution worker.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {workflowsQuery.data && workflowsQuery.data.length > 0 ? (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Last execution</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflowsQuery.data.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell>
                    <div className="font-medium">{workflow.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{workflow.slug}</Badge>
                      <span>{workflow.description ?? "No description"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={workflow.status} />
                  </TableCell>
                  <TableCell>v{workflow.currentVersion.version}</TableCell>
                  <TableCell>
                    <div className="text-sm">{workflow.currentVersion.definition.nodes.length}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {workflow.currentVersion.definition.edges.length} edges
                    </div>
                  </TableCell>
                  <TableCell>
                    <LastExecution workspaceId={workspaceId} workflow={workflow} />
                  </TableCell>
                  <TableCell>{formatRelative(workflow.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <RunWorkflowButton
                        workspaceId={workspaceId}
                        workflowId={workflow.id}
                        disabled={!canEditWorkflows}
                        size="icon"
                        variant="ghost"
                        aria-label={`Run ${workflow.name}`}
                      />
                      <Button asChild size="icon" variant="ghost" aria-label={`Open ${workflow.name}`}>
                        <Link to={`/app/workspaces/${workspaceId}/workflows/${workflow.id}`}>
                          <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </section>
  );
}

function canWriteWorkflows(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function LastExecution({ workspaceId, workflow }: { workspaceId: string; workflow: Workflow }) {
  const executionsQuery = useQuery({
    queryKey: queryKeys.workflowExecutions(workspaceId, workflow.id),
    queryFn: () => listWorkflowExecutions(workspaceId, workflow.id),
    enabled: Boolean(workspaceId && workflow.id),
    staleTime: 10_000
  });
  const execution = executionsQuery.data?.[0];

  if (executionsQuery.isLoading) {
    return <Skeleton className="h-6 w-28" />;
  }

  if (!execution) {
    return <span className="text-sm text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <StatusBadge status={execution.status} />
      <span className="text-xs text-muted-foreground">{formatDateTime(execution.createdAt)}</span>
    </div>
  );
}

function WorkflowsSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
