import { Badge } from "@/shared/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "SUCCEEDED" || status === "ACTIVE"
      ? "success"
      : status === "FAILED"
        ? "danger"
        : status === "RUNNING" || status === "PENDING" || status === "DRAFT"
          ? "warning"
          : "secondary";

  return <Badge variant={variant}>{status}</Badge>;
}
