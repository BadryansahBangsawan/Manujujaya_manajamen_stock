import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { cn } from "@Manujujaya-Manajemen-stock/ui/lib/utils";

import { useLanguage } from "./language-provider";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center rounded-full border border-[#353535]/25 bg-white/80 p-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-8 rounded-full px-3 text-xs font-semibold",
          language === "id" ? "bg-[#353535] text-white hover:bg-[#353535] hover:text-white" : "text-slate-600",
        )}
        onClick={() => setLanguage("id")}
      >
        ID
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-8 rounded-full px-3 text-xs font-semibold",
          language === "en" ? "bg-[#353535] text-white hover:bg-[#353535] hover:text-white" : "text-slate-600",
        )}
        onClick={() => setLanguage("en")}
      >
        EN
      </Button>
    </div>
  );
}
