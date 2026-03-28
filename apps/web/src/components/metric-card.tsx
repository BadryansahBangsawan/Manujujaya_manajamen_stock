import { Badge } from "@Manujujaya-Manajemen-stock/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "warning" | "success";
  chip?: string;
};

export function MetricCard({
  title,
  value,
  caption,
  icon: Icon,
  tone = "default",
  chip,
}: MetricCardProps) {
  return (
    <Card
      data-reveal-item
      className={cn(
        "overflow-hidden rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8",
        tone === "danger" && "bg-rose-50/80 dark:bg-rose-950/30",
        tone === "warning" && "bg-amber-50/80 dark:bg-amber-950/25",
        tone === "success" && "bg-emerald-50/80 dark:bg-emerald-950/25",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {value}
          </CardTitle>
        </div>
        <div className="flex flex-col items-end gap-3">
          {chip ? <Badge variant="outline">{chip}</Badge> : null}
          <div className="rounded-2xl border border-slate-950/8 bg-white/70 p-3 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}
