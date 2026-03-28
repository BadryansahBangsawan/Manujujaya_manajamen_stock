import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type * as React from "react";

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-10 w-full appearance-none rounded-full border border-input bg-transparent px-4 pr-10 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40 dark:bg-input/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export { Select };
