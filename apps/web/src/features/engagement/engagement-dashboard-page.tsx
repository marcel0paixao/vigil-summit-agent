import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getEngagementDashboard } from "@/shared/api/engagement";
import { queryKeys } from "@/shared/api/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function EngagementDashboardPage() {
  const { workspaceId = "" } = useParams();
  const query = useQuery({ queryKey: queryKeys.engagementDashboard(workspaceId), queryFn: () => getEngagementDashboard(workspaceId), enabled: Boolean(workspaceId) });
  if (query.isLoading) return <section className="grid gap-4 p-6 md:grid-cols-4"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></section>;
  if (!query.data) return <section className="p-6 text-sm text-destructive">Dashboard could not be loaded.</section>;
  const registered = sum(query.data.registrations, ["REGISTERED", "CONFIRMED", "ATTENDED"]);
  const confirmed = sum(query.data.registrations, ["CONFIRMED", "ATTENDED"]);
  const attended = sum(query.data.registrations, ["ATTENDED"]);
  const qualified = sum(query.data.qualifications, ["QUALIFIED"]);
  const metrics = [
    ["Registered", registered], ["Confirmed", confirmed], ["Attended", attended], ["Qualified", qualified],
    ["Delivered messages", query.data.deliveredMessages], ["Booked meetings", query.data.bookedMeetings]
  ] as const;
  const rates = [["Confirmation rate", query.data.rates.confirmation], ["Attendance rate", query.data.rates.attendance], ["Meeting rate", query.data.rates.meeting]] as const;
  return <section className="grid gap-6 p-4 lg:p-6"><div><h1 className="text-2xl font-semibold">Engagement</h1><p className="text-sm text-muted-foreground">Registration-to-meeting funnel with a 70% attendance target.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{value}</CardContent></Card>)}</div><div className="grid gap-4 sm:grid-cols-3">{rates.map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{Math.round(value * 100)}%</div>{label === "Attendance rate" ? <p className={`text-xs ${value >= query.data.attendanceTarget ? "text-emerald-600" : "text-amber-600"}`}>{value >= query.data.attendanceTarget ? "Target reached" : "Below 70% target"}</p> : null}</CardContent></Card>)}</div></section>;
}

function sum(rows: Array<{ status: string; _count: { _all: number } }>, statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row._count._all, 0);
}
