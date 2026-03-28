import { Badge } from "@Manujujaya-Manajemen-stock/ui/components/badge";
import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/components/language-provider";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  coverage?: string;
  actionLabel?: string;
  actionTo?: string;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  coverage,
  actionLabel,
  actionTo,
  className,
}: PageHeaderProps) {
  const { language } = useLanguage();

  return (
    <div data-reveal-item className={cn("flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {eyebrow ? <Badge variant="outline">{eyebrow}</Badge> : null}
          {coverage ? (
            <Badge variant="secondary">{language === "id" ? `Cakupan ${coverage}` : `Coverage ${coverage}`}</Badge>
          ) : null}
        </div>
        <div className="space-y-3">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white md:text-5xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
            {description}
          </p>
        </div>
      </div>
      {actionLabel && actionTo ? (
        <Button render={<Link to={actionTo} />} className="rounded-full px-5">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
