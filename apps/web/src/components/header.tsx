import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BarChart3, Boxes, FileBarChart2, History, PackageSearch, ShoppingBasket, Upload } from "lucide-react";

import { useLanguage } from "./language-provider";
import { LanguageToggle } from "./language-toggle";

const navigation = [
  { to: "/", idLabel: "Dashboard", enLabel: "Dashboard", icon: BarChart3 },
  { to: "/upload", idLabel: "Upload Data", enLabel: "Upload Data", icon: Upload },
  { to: "/stock-analysis", idLabel: "Analisis Stok", enLabel: "Stock Analysis", icon: Boxes },
  { to: "/purchase-recommendations", idLabel: "Prioritas Beli", enLabel: "Buy Priority", icon: ShoppingBasket },
  { to: "/high-priority-stock", idLabel: "Stok Prioritas Tinggi", enLabel: "High Priority Stock", icon: AlertTriangle },
  { to: "/slow-moving", idLabel: "Slow Moving", enLabel: "Slow Moving", icon: PackageSearch },
  { to: "/reports", idLabel: "Laporan", enLabel: "Reports", icon: FileBarChart2 },
  { to: "/upload-history", idLabel: "Histori", enLabel: "History", icon: History },
] as const;

export default function Header() {
  const { language } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-950/6 bg-white/80 backdrop-blur-xl dark:border-white/8 dark:bg-[#121212]/90">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#353535]/20 bg-[#353535] px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-white uppercase dark:border-[#353535]/40 dark:bg-[#353535] dark:text-white">
              Manujujaya Analytics
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {language === "id"
                ? "Dashboard keputusan stok spare part dan bengkel"
                : "Spare part and workshop inventory decision dashboard"}
            </p>
          </div>
          <LanguageToggle />
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {navigation.map(({ to, idLabel, enLabel, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-[#353535]/20 px-4 py-2 text-xs font-medium whitespace-nowrap text-slate-600 transition-colors hover:border-[#353535]/30 hover:bg-[#353535] hover:text-white dark:border-[#353535]/45 dark:text-slate-300 dark:hover:border-[#353535] dark:hover:bg-[#353535] dark:hover:text-white",
              )}
              activeProps={{
                className:
                  "border-transparent bg-[#353535] text-white dark:bg-[#353535] dark:text-white",
              }}
            >
              <Icon className="size-3.5" />
              {language === "id" ? idLabel : enLabel}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
