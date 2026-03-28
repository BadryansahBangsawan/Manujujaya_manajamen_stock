import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-28 w-full rounded-3xl border border-input bg-transparent px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
