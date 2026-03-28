import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { Card, CardContent } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import { Link } from "@tanstack/react-router";

export function EmptyPanel({
  title,
  description,
  actionLabel,
  actionTo,
  className,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  className?: string;
}) {
  return (
    <Card
      data-reveal-item
      className={cn(
        "rounded-[28px] border-none bg-gradient-to-br from-[#353535] to-[#4a4a4a] text-slate-100 shadow-[0_30px_120px_-50px_rgba(53,53,53,0.75)]",
        className,
      )}
    >
      <CardContent className="flex min-h-56 flex-col justify-between gap-8 p-8">
        <div className="space-y-3">
          <p className="text-xl font-semibold">{title}</p>
          <p className="max-w-xl text-sm leading-7 text-slate-300">{description}</p>
        </div>
        {actionLabel && actionTo ? (
          <Button render={<Link to={actionTo} />} variant="secondary" className="w-fit rounded-full px-5">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
