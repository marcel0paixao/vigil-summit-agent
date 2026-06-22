import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { queryKeys } from "@/shared/api/query-keys";
import { getWorkspace } from "@/shared/api/workspaces";
import { formatDateTime } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function WorkspaceSettingsPage() {
  const { workspaceId = "" } = useParams();
  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspace(workspaceId),
    queryFn: () => getWorkspace(workspaceId),
    enabled: Boolean(workspaceId)
  });

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Workspace identity.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{workspaceQuery.data?.name ?? "Workspace"}</CardTitle>
          <CardDescription>{workspaceQuery.data?.id ?? "Loading"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {workspaceQuery.isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : (
            <>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Slug</p>
                <div className="mt-2">
                  <Badge variant="outline">{workspaceQuery.data?.slug}</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Created</p>
                <p className="mt-2 text-sm">{formatDateTime(workspaceQuery.data?.createdAt)}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
