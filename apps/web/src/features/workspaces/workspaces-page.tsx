import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { createWorkspace, listWorkspaces } from "@/shared/api/workspaces";
import { ApiError } from "@/shared/api/http";
import { queryKeys } from "@/shared/api/query-keys";
import { formatDateTime, slugify } from "@/shared/lib/utils";
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
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens")
});

type CreateWorkspaceForm = z.infer<typeof createWorkspaceSchema>;

export function WorkspacesPage() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: listWorkspaces
  });
  const form = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      slug: ""
    }
  });
  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      setOpen(false);
      form.reset();
      navigate(`/app/workspaces/${workspace.id}/workflows`);
    }
  });

  async function onSubmit(values: CreateWorkspaceForm) {
    form.clearErrors("root");

    try {
      await createMutation.mutateAsync(values);
    } catch (error) {
      form.setError("root", {
        message: error instanceof ApiError ? error.message : "Workspace creation failed"
      });
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tenant boundaries for teams and workflows.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              New workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create workspace</DialogTitle>
              <DialogDescription>Set the tenant name and URL-safe slug.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                  id="workspace-name"
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
                <Label htmlFor="workspace-slug">Slug</Label>
                <Input id="workspace-slug" {...form.register("slug")} />
                {form.formState.errors.slug ? (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                ) : null}
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

      {workspacesQuery.isLoading ? <WorkspacesSkeleton /> : null}

      {workspacesQuery.data && workspacesQuery.data.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Building2 className="size-5" />
            </div>
            <CardTitle>No workspaces yet</CardTitle>
            <CardDescription>Create the first tenant workspace to start building workflows.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {workspacesQuery.data && workspacesQuery.data.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspacesQuery.data.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell>
                    <div className="font-medium">{workspace.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{workspace.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{workspace.slug}</Badge>
                  </TableCell>
                  <TableCell>{workspace.members.length}</TableCell>
                  <TableCell>{formatDateTime(workspace.createdAt)}</TableCell>
                  <TableCell>
                    <Button asChild size="icon" variant="ghost" aria-label={`Open ${workspace.name}`}>
                      <Link to={`/app/workspaces/${workspace.id}/workflows`}>
                        <ArrowRight />
                      </Link>
                    </Button>
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

function WorkspacesSkeleton() {
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
