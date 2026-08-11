import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useDbHealth } from "@/hooks/use-db-health";

export function AppHeader() {
  const health = useDbHealth();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-5" />
      <div className="ml-auto flex items-center gap-3">
        <Badge
          variant={health?.ok ? "secondary" : "destructive"}
          className="gap-1.5 font-mono text-xs"
        >
          <span
            className={`size-1.5 rounded-full ${health?.ok ? "bg-emerald-500" : "bg-destructive"}`}
          />
          {health?.ok ? `SQLite · ${health.migrations} migration(s)` : "DB offline"}
        </Badge>
      </div>
    </header>
  );
}
