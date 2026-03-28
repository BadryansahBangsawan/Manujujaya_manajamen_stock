import { Alert, AlertDescription, AlertTitle } from "@Manujujaya-Manajemen-stock/ui/components/alert";
import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Archive,
  Boxes,
  Flame,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartPanel } from "@/components/chart-panel";
import { EmptyPanel } from "@/components/empty-panel";
import { useLanguage } from "@/components/language-provider";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PriorityBadge, StockStatusBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatCurrency, formatDateRange, formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const PIE_COLORS = ["#0f172a", "#f59e0b", "#3b82f6", "#ef4444"];

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const summaryQuery = useQuery(orpc.dashboard.getSummary.queryOptions());
  const chartsQuery = useQuery(orpc.dashboard.getCharts.queryOptions());

  const summary = summaryQuery.data?.summary;
  const urgentItems = summaryQuery.data?.urgentItems ?? [];
  const charts = chartsQuery.data;

  if (!summary) {
    return (
      <div ref={revealRef} className="space-y-8">
        <PageHeader
          eyebrow="Dashboard"
          title={isId ? "Pusat keputusan stok bengkel yang cepat dibaca" : "A fast-read inventory decision center"}
          description={
            isId
              ? "Pantau barang kosong, stok kritis, performa penjualan, dan prioritas pembelian dalam satu tampilan analitik."
              : "Track out-of-stock items, critical stock, sales performance, and purchase priorities in one analytics view."
          }
        />
        <EmptyPanel
          title={isId ? "Belum ada snapshot data aktif" : "No active data snapshot yet"}
          description={
            isId
              ? "Upload file master barang dan file penjualan untuk mengaktifkan dashboard. Sistem sudah menyiapkan alur import dengan mapping kolom dan histori batch."
              : "Upload master inventory and sales files to activate the dashboard. Import flow, mapping, and history are ready."
          }
          actionLabel={isId ? "Mulai upload data" : "Start data upload"}
          actionTo="/upload"
        />
      </div>
    );
  }

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Dashboard Utama" : "Main Dashboard"}
        title={
          isId
            ? "Analitik stok dan rekomendasi pembelian yang fokus ke keputusan harian"
            : "Inventory analytics and purchase recommendations for daily decisions"
        }
        description={
          isId
            ? "Gunakan coverage data aktif, status stok, dan pola penjualan untuk menentukan pembelian ulang dengan cepat tanpa membuka spreadsheet satu per satu."
            : "Use active coverage, stock status, and sales patterns to decide replenishment quickly."
        }
        coverage={formatDateRange(summary.coverageStart, summary.coverageEnd)}
        actionLabel={isId ? "Upload batch baru" : "Upload new batch"}
        actionTo="/upload"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          title={isId ? "Total barang" : "Total items"}
          value={formatNumber(summary.totalItems)}
          caption={isId ? "Seluruh item pada master aktif" : "All items in active master"}
          icon={Boxes}
        />
        <MetricCard
          title={isId ? "Stok kosong" : "Out of stock"}
          value={formatNumber(summary.totalOutOfStock)}
          caption={isId ? "Item yang perlu perhatian instan" : "Items requiring immediate attention"}
          icon={AlertTriangle}
          tone="danger"
        />
        <MetricCard
          title={isId ? "Stok rendah" : "Low stock"}
          value={formatNumber(summary.totalLowStock)}
          caption={isId ? "Di bawah reorder point aktif" : "Below active reorder point"}
          icon={Archive}
          tone="warning"
        />
        <MetricCard
          title="Fast moving"
          value={formatNumber(summary.totalFastMoving)}
          caption={isId ? "Permintaan tinggi pada coverage aktif" : "High demand in active coverage"}
          icon={Flame}
          tone="success"
        />
        <MetricCard
          title="Slow / dead"
          value={formatNumber(summary.totalSlowMoving + summary.totalDeadMoving)}
          caption={isId ? "Terlalu lama bertahan di rak" : "Staying too long on shelf"}
          icon={TrendingDown}
          chip={`${summary.totalDeadMoving} ${isId ? "mati" : "dead"}`}
        />
        <MetricCard
          title={isId ? "Prioritas beli" : "Buy priority"}
          value={formatNumber(summary.totalPriorityBuy)}
          caption={
            summary.hasPartialCosting
              ? `${formatCurrency(summary.estimatedRestockValue)} ${isId ? "estimasi parsial" : "partial estimate"}`
              : `${formatCurrency(summary.estimatedRestockValue)} ${isId ? "estimasi restock" : "restock estimate"}`
          }
          icon={ShoppingCart}
          chip={summary.hasPartialCosting ? (isId ? "parsial" : "partial") : isId ? "lengkap" : "complete"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartPanel
          title={isId ? "Barang paling laku" : "Top selling items"}
          description={isId ? "Top item berdasarkan qty terjual pada snapshot aktif" : "Top items by sold quantity in active snapshot"}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.topSelling ?? []}>
                <XAxis dataKey="label" hide />
                <YAxis stroke="currentColor" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[14, 14, 4, 4]} fill="#0f172a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
        <div className="grid gap-6">
          <ChartPanel
            title={isId ? "Distribusi status stok" : "Stock status distribution"}
            description={isId ? "Kosong, rendah, dan aman" : "Out, low, and safe"}
          >
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts?.stockDistribution ?? []}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={4}
                  >
                    {(charts?.stockDistribution ?? []).map((entry, index) => (
                      <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
          <ChartPanel
            title="Fast / medium / slow / dead"
            description={isId ? "Klasifikasi pergerakan barang pada coverage aktif" : "Movement classification in active coverage"}
          >
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts?.movementDistribution ?? []}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={86}
                    paddingAngle={4}
                  >
                    {(charts?.movementDistribution ?? []).map((entry, index) => (
                      <Cell key={entry.label} fill={PIE_COLORS[(index + 1) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartPanel
          title={isId ? "Tren penjualan per periode" : "Sales trend by period"}
          description={isId ? "Jika batch aktif hanya satu periode, panel ini tetap menunjukkan coverage aktual." : "If active batches only cover one period, this panel still shows current coverage."}
        >
          {charts?.trend && charts.trend.length > 1 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.trend}>
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="qty" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Alert>
              <AlertTitle>
                {isId
                  ? "Coverage aktif belum cukup panjang untuk line chart penuh"
                  : "Active coverage is not long enough for a full line chart"}
              </AlertTitle>
              <AlertDescription>
                {isId
                  ? "Sistem tetap membaca status stok dan prioritas beli dari snapshot aktif. Tambahkan batch sales summary lain atau file transaksi untuk tren yang lebih kaya."
                  : "The system still reads stock status and purchase priority from the active snapshot. Add more summary or transaction batches for richer trends."}
              </AlertDescription>
            </Alert>
          )}
        </ChartPanel>
        <ChartPanel
          title={isId ? "Alert stok kritis" : "Critical stock alerts"}
          description={isId ? "Item paling mendesak untuk dicek sekarang" : "Most urgent items to check now"}
        >
          <div className="space-y-3">
            {urgentItems.length === 0 ? (
              <Alert>
                <AlertTitle>{isId ? "Tidak ada alert prioritas tinggi" : "No high-priority alerts"}</AlertTitle>
                <AlertDescription>
                  {isId
                    ? "Snapshot aktif saat ini relatif aman untuk item fast moving."
                    : "Current active snapshot is relatively safe for fast moving items."}
                </AlertDescription>
              </Alert>
            ) : (
              urgentItems.map((item) => (
                <Link
                  key={item.itemCode}
                  to="/items/$itemId"
                  params={{ itemId: item.itemCode }}
                  className="flex items-start justify-between gap-4 rounded-[22px] border border-slate-950/8 bg-slate-50/70 p-4 transition-colors hover:border-slate-950/16 hover:bg-slate-50 dark:border-white/8 dark:bg-white/3 dark:hover:border-white/14 dark:hover:bg-white/5"
                >
                  <div className="space-y-2">
                    <p className="font-medium text-slate-950 dark:text-white">{item.itemName}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StockStatusBadge status={item.stockStatus} />
                      <PriorityBadge priority={item.purchasePriority} />
                    </div>
                    <p className="text-xs leading-6 text-muted-foreground">{item.reasons.join(" • ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                      {isId ? "Saran beli" : "Suggested buy"}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                      {formatNumber(item.recommendedOrderQty)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="mt-4">
            <Button render={<Link to="/purchase-recommendations" />} variant="outline" className="rounded-full">
              {isId ? "Lihat ranking pembelian" : "View purchase ranking"}
            </Button>
          </div>
        </ChartPanel>
      </section>
    </div>
  );
}
