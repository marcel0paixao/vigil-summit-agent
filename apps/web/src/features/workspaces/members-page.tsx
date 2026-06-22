import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { queryKeys } from "@/shared/api/query-keys";
import { listWorkspaceMembers } from "@/shared/api/workspaces";
import { formatDateTime } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

export function MembersPage() {
  const { workspaceId = "" } = useParams();
  const membersQuery = useQuery({
    queryKey: queryKeys.workspaceMembers(workspaceId),
    queryFn: () => listWorkspaceMembers(workspaceId),
    enabled: Boolean(workspaceId)
  });

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">Workspace roles and access.</p>
      </div>
      <Card>
        {membersQuery.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Member since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="font-medium">{member.user.displayName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{member.user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{member.role}</Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(member.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}
