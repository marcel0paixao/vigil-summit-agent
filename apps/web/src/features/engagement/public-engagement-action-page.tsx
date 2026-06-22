import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { applyPublicEngagementAction } from "@/shared/api/engagement";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

export function PublicEngagementActionPage() {
  const { token = "" } = useParams();
  const mutation = useMutation({ mutationFn: () => applyPublicEngagementAction(token) });
  useEffect(() => { if (token && mutation.isIdle) mutation.mutate(); }, [token, mutation]);
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Vigil Summit</CardTitle></CardHeader><CardContent>{mutation.isPending || mutation.isIdle ? <Skeleton className="h-16" /> : mutation.isError ? <p className="text-destructive">This action link is invalid or expired.</p> : <div><p className="font-medium">Preference updated.</p><p className="mt-1 text-sm text-muted-foreground">Action: {mutation.data?.action}. Registration: {mutation.data?.status}.</p></div>}</CardContent></Card></main>;
}
