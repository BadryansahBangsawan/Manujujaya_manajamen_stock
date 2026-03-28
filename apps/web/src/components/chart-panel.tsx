import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import type * as React from "react";

export function ChartPanel({
  title,
  description,
  children,
  className,
}: React.PropsWithChildren<{
  title: string;
  description?: string;
  className?: string;
}>) {
  return (
    <Card
      data-reveal-item
      className={cn(
        "rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8",
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
