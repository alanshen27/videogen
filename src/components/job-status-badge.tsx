import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const outlineByStatus: Record<string, string> = {
  PENDING: "border-border bg-muted/60 text-muted-foreground",
  PLANNING: "border-blue-500/35 bg-blue-500/10 text-blue-300",
  SCRIPTING: "border-indigo-500/35 bg-indigo-500/10 text-indigo-300",
  ASSETS: "border-purple-500/35 bg-purple-500/10 text-purple-300",
  RENDERING: "border-orange-500/35 bg-orange-500/10 text-orange-300",
  COMPLETED: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
};

export function JobStatusBadge({ status }: { status: string }) {
  if (status === "FAILED") {
    return <Badge variant="destructive">{status}</Badge>;
  }

  return (
    <Badge
      variant="outline"
      className={cn(outlineByStatus[status] ?? outlineByStatus.PENDING)}
    >
      {status}
    </Badge>
  );
}
