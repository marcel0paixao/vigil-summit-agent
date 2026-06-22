import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { listEvents, transitionEvent } from "@/shared/api/events";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function EventsPage() {
  const { workspaceId = "" } = useParams(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["events", workspaceId], queryFn: () => listEvents(workspaceId), enabled: Boolean(workspaceId) });
  const transition = useMutation({ mutationFn: ({ eventId, action }: { eventId: string; action: "publish" | "start" | "complete" | "cancel" }) => transitionEvent(workspaceId, eventId, action), onSuccess: () => client.invalidateQueries({ queryKey: ["events", workspaceId] }) });
  if (query.isLoading) return <section className="p-6"><Skeleton className="h-72" /></section>;
  return <section className="grid gap-6 p-4 lg:p-6"><div><h1 className="text-2xl font-semibold">Events</h1><p className="text-sm text-muted-foreground">Lifecycle, capacity and public registration entry points.</p></div><div className="grid gap-4">{query.data?.map((event) => <Card key={event.id}><CardHeader><CardTitle>{event.name}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><div>{new Date(event.startsAt).toLocaleString()} · {event.location}</div><div className="text-muted-foreground">{event.status} · capacity {event.capacity}</div><a className="text-primary underline" href={`/events/${event.id}/register`}>Public registration</a></div><div className="flex gap-2">{event.status === "DRAFT" ? <Button onClick={() => transition.mutate({ eventId: event.id, action: "publish" })}>Publish</Button> : null}{event.status === "PUBLISHED" ? <Button onClick={() => transition.mutate({ eventId: event.id, action: "start" })}>Start</Button> : null}{event.status === "LIVE" ? <Button onClick={() => transition.mutate({ eventId: event.id, action: "complete" })}>Complete</Button> : null}{event.status !== "COMPLETED" && event.status !== "CANCELLED" ? <Button variant="outline" onClick={() => transition.mutate({ eventId: event.id, action: "cancel" })}>Cancel</Button> : null}</div></CardContent></Card>)}</div></section>;
}
