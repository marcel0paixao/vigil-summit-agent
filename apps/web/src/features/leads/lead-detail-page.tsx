import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { exportLead, getLead, withdrawLeadConsent } from "@/shared/api/leads";
import { queryKeys } from "@/shared/api/query-keys";
import { bookDemoMeeting, recordDemoInterest, recordDemoReply, updateRegistrationStatus } from "@/shared/api/engagement";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function LeadDetailPage() {
  const { workspaceId = "", leadId = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.lead(workspaceId, leadId), queryFn: () => getLead(workspaceId, leadId), enabled: Boolean(workspaceId && leadId) });
  const withdraw = useMutation({ mutationFn: () => withdrawLeadConsent(workspaceId, leadId), onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.lead(workspaceId, leadId) }) });
  const exportData = useMutation({ mutationFn: () => exportLead(workspaceId, leadId) });
  const refresh = () => { void client.invalidateQueries({ queryKey: queryKeys.lead(workspaceId, leadId) }); void client.invalidateQueries({ queryKey: queryKeys.engagementDashboard(workspaceId) }); };
  const demo = useMutation({ mutationFn: async (action: string) => { const registration = query.data?.registrations[0]; if (!registration) return; if (["CONFIRMED", "ATTENDED", "NO_SHOW"].includes(action)) return updateRegistrationStatus(workspaceId, registration.id, action); if (action === "INTEREST") return recordDemoInterest(workspaceId, registration.id); if (action === "REPLY") return recordDemoReply(workspaceId, registration.id); return bookDemoMeeting(workspaceId, registration.id); }, onSuccess: refresh });
  if (query.isLoading) return <section className="p-6"><Skeleton className="h-96" /></section>;
  if (!query.data) return <section className="p-6 text-sm text-destructive">Lead could not be loaded.</section>;
  const lead = query.data;
  const messages = lead.conversations.flatMap((conversation) => conversation.messages);
  return <section className="grid gap-6 p-4 lg:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">{lead.fullName}</h1><p className="text-sm text-muted-foreground">{lead.jobTitle ?? "Role not informed"} at {lead.companyName}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => exportData.mutate()}>Export LGPD</Button><Button variant="outline" onClick={() => withdraw.mutate()}>Withdraw commercial consent</Button></div></div>
    {exportData.data ? <Card><CardContent className="pt-6 text-sm">Export prepared at {new Date(exportData.data.exportedAt).toLocaleString()} with {exportData.data.data.consentRecords.length} consent records.</CardContent></Card> : null}
    <Card><CardHeader><CardTitle>Safe demo controls</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => demo.mutate("CONFIRMED")}>Confirm</Button><Button variant="outline" onClick={() => demo.mutate("ATTENDED")}>Attend</Button><Button variant="outline" onClick={() => demo.mutate("NO_SHOW")}>No-show</Button><Button variant="outline" onClick={() => demo.mutate("INTEREST")}>Record session</Button><Button variant="outline" onClick={() => demo.mutate("REPLY")}>Simulate meeting reply</Button><Button onClick={() => demo.mutate("MEETING")}>Book demo meeting</Button></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle>Registrations</CardTitle></CardHeader><CardContent className="space-y-2">{lead.registrations.map((item) => <div key={item.id} className="flex justify-between gap-2"><span>{item.event.name}</span><Badge>{item.status}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Enrichment provenance</CardTitle></CardHeader><CardContent className="space-y-2">{lead.enrichmentSnapshots.map((item) => <div key={item.id}><div className="font-medium">{item.provider} · {item.status}</div><div className="text-xs text-muted-foreground">{item.companyIndustry ?? "Industry unavailable"} · confidence {item.confidence ?? "-"}</div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Commercial outcome</CardTitle></CardHeader><CardContent>{lead.meetings.length ? lead.meetings.map((meeting) => <div key={meeting.id}>{meeting.status} · {meeting.startsAt ? new Date(meeting.startsAt).toLocaleString() : "No slot"}</div>) : <span className="text-sm text-muted-foreground">No meeting booked</span>}</CardContent></Card></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Conversation timeline</CardTitle></CardHeader><CardContent className="space-y-3">{messages.length ? messages.map((message) => <article key={message.id} className="rounded-md border p-3"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{message.direction} · {message.status}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><div className="font-medium">{message.subject}</div><p className="whitespace-pre-wrap text-sm">{message.body}</p></article>) : <p className="text-sm text-muted-foreground">No messages yet.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Agent decisions</CardTitle></CardHeader><CardContent className="space-y-3">{lead.agentDecisions.map((decision) => <article key={decision.id} className="rounded-md border p-3"><div className="flex justify-between"><strong>{decision.action}</strong><Badge>{decision.status}</Badge></div><p className="mt-1 text-sm">{decision.rationale}</p><p className="mt-1 text-xs text-muted-foreground">{decision.model ?? "policy-only"} · {decision.reasonCodes.join(", ")}</p></article>)}</CardContent></Card></div>
  </section>;
}
