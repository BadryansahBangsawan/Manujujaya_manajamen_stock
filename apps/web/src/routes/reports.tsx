import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { PageHeader } from "@/components/page-header";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { downloadExcelReport, downloadPdfReport } from "@/lib/export";
import { formatCurrency, formatDateRange, formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const reportQuery = useQuery(orpc.reports.exportExcel.queryOptions());
  const payload = reportQuery.data;

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Laporan & Export" : "Reports & Export"}
        title={isId ? "Keluarkan snapshot analitik aktif ke Excel atau PDF" : "Export active analytics snapshot to Excel or PDF"}
        description={
          isId
            ? "Gunakan export untuk berbagi rekomendasi pembelian, stok kritis, dan barang lambat/tidak terjual ke tim operasional."
            : "Use export to share purchase recommendations, critical stock, and slow/non-selling items with operations team."
        }
        coverage={formatDateRange(payload?.summary?.coverageStart, payload?.summary?.coverageEnd)}
      />

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card
          data-reveal-item
          className="rounded-[28px] border-none bg-[#353535] text-slate-100 shadow-[0_30px_120px_-50px_rgba(53,53,53,0.75)]"
        >
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">{isId ? "Export sekarang" : "Export now"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full rounded-full"
              onClick={() => payload && downloadExcelReport(payload)}
            >
              <FileSpreadsheet className="size-4" />
              {isId ? "Download Excel" : "Download Excel"}
            </Button>
            <Button
              className="w-full rounded-full"
              variant="secondary"
              onClick={() => payload && downloadPdfReport(payload)}
            >
              <FileText className="size-4" />
              {isId ? "Download PDF" : "Download PDF"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <InfoCard
            title={isId ? "Cakupan aktif" : "Active coverage"}
            value={formatDateRange(payload?.summary?.coverageStart, payload?.summary?.coverageEnd)}
            caption={isId ? "Periode data yang dipakai untuk menghitung analisis" : "Data period used for analysis"}
          />
          <InfoCard
            title={isId ? "Estimasi restock" : "Restock estimate"}
            value={formatCurrency(payload?.summary?.estimatedRestockValue ?? 0)}
            caption={payload?.summary?.hasPartialCosting ? (isId ? "Estimasi parsial" : "Partial estimate") : isId ? "Estimasi lengkap" : "Complete estimate"}
          />
          <InfoCard
            title={isId ? "Prioritas beli" : "Buy priority"}
            value={formatNumber(payload?.summary?.totalPriorityBuy ?? 0)}
            caption={isId ? "Item yang perlu ditindak" : "Items requiring action"}
          />
          <InfoCard
            title={isId ? "Lambat / tidak terjual" : "Slow / not selling"}
            value={formatNumber((payload?.summary?.totalSlowMoving ?? 0) + (payload?.summary?.totalDeadMoving ?? 0))}
            caption={isId ? "Item dengan keterjualan rendah" : "Items with low selling speed"}
          />
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <Card
      data-reveal-item
      className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
    >
      <CardContent className="space-y-3 p-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">{title}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}
