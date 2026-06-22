import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export function ErrorState({
  message,
  title = "Something went wrong",
  onRetry
}: {
  message?: string;
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {message ?? "Refresh the request or try again in a moment."}
            </p>
          </div>
        </div>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw />
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
