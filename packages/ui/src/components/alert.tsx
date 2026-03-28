import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import type * as React from "react";

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "danger" | "warning";
}) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      className={cn(
        "rounded-3xl border px-4 py-3 text-sm",
        "data-[variant=default]:border-border/70 data-[variant=default]:bg-background/80",
        "data-[variant=danger]:border-rose-500/15 data-[variant=danger]:bg-rose-500/8 data-[variant=danger]:text-rose-200 dark:data-[variant=danger]:text-rose-100",
        "data-[variant=warning]:border-amber-500/15 data-[variant=warning]:bg-amber-500/8 data-[variant=warning]:text-amber-200 dark:data-[variant=warning]:text-amber-100",
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("font-semibold text-sm", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-1 text-xs text-muted-foreground", className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
