import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { listLeads } from "@/shared/api/leads";
import { queryKeys } from "@/shared/api/query-keys";
import type { QualificationStatus } from "@/shared/api/types";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

export function LeadsPage() {
  const { workspaceId = "" } = useParams();
  const query = useQuery({
    queryKey: queryKeys.leads(workspaceId),
    queryFn: () => listLeads(workspaceId),
    enabled: Boolean(workspaceId)
  });

  return (
    <section className="grid gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">Qualification and registration provenance.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Engagement pipeline</CardTitle></CardHeader>
        <CardContent>
          {query.isLoading ? <Skeleton className="h-64 w-full" /> : null}
          {query.isError ? <p className="text-sm text-destructive">Leads could not be loaded.</p> : null}
          {query.data ? (
            <Table>
              <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Company</TableHead><TableHead>Registration</TableHead><TableHead>Qualification</TableHead></TableRow></TableHeader>
              <TableBody>
                {query.data.map((lead) => {
                  const registration = lead.registrations[0];
                  return (
                    <TableRow key={lead.id}>
                      <TableCell><Link className="font-medium underline-offset-4 hover:underline" to={`${lead.id}`}>{lead.fullName}</Link><div className="text-xs text-muted-foreground">{lead.workEmail}</div></TableCell>
                      <TableCell><div>{lead.companyName}</div><div className="text-xs text-muted-foreground">{lead.jobTitle ?? "Role not informed"}</div></TableCell>
                      <TableCell>{registration?.status ?? "-"}</TableCell>
                      <TableCell>{registration?.qualification ? <QualificationBadge status={registration.qualification.status} score={registration.qualification.score} /> : <Badge variant="outline">Pending</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function QualificationBadge({ status, score }: { status: QualificationStatus; score: number }) {
  const variant = status === "QUALIFIED" ? "success" : status === "DISQUALIFIED" ? "danger" : "warning";
  return <Badge variant={variant}>{status} · {score}</Badge>;
}
