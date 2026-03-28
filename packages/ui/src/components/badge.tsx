import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import type * as React from "react";

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
}) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase",
        "data-[variant=default]:border-primary/15 data-[variant=default]:bg-primary/10 data-[variant=default]:text-primary",
        "data-[variant=secondary]:border-muted-foreground/10 data-[variant=secondary]:bg-muted data-[variant=secondary]:text-foreground",
        "data-[variant=outline]:border-border data-[variant=outline]:bg-background data-[variant=outline]:text-foreground",
        "data-[variant=success]:border-emerald-500/15 data-[variant=success]:bg-emerald-500/10 data-[variant=success]:text-emerald-600 dark:data-[variant=success]:text-emerald-300",
        "data-[variant=warning]:border-amber-500/15 data-[variant=warning]:bg-amber-500/10 data-[variant=warning]:text-amber-600 dark:data-[variant=warning]:text-amber-300",
        "data-[variant=danger]:border-rose-500/15 data-[variant=danger]:bg-rose-500/10 data-[variant=danger]:text-rose-600 dark:data-[variant=danger]:text-rose-300",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
