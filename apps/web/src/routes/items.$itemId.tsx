import { Card, CardContent, CardHeader, CardTitle } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { useLanguage } from "@/components/language-provider";
import { MovementBadge, PriorityBadge, StockStatusBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatCurrency, formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/items/$itemId")({
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const { itemId } = Route.useParams();
  const query = useQuery(orpc.items.getDetail.queryOptions({ input: { itemCode: itemId } }));

  const item = query.data?.item;

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Detail Barang" : "Item Detail"}
        title={item?.itemName ?? itemId}
        description={
          isId
            ? "Lihat posisi stok saat ini, riwayat penjualan, klasifikasi keterjualan, dan alasan rekomendasi pembelian untuk item yang dipilih."
            : "View current stock, sales history, selling-speed classification, and recommendation reasons for selected item."
        }
      />

      {item ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label={isId ? "Stok saat ini" : "Current stock"} value={formatNumber(item.currentStock)} />
            <StatCard label={isId ? "Qty aktif" : "Active qty"} value={formatNumber(item.qtyTotal)} />
            <StatCard
              label={isId ? "Nilai penjualan" : "Sales value"}
              value={formatCurrency(item.salesValueTotal)}
            />
            <StatCard label={isId ? "Saran beli" : "Suggested buy"} value={formatNumber(item.recommendedOrderQty)} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card
              data-reveal-item
              className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
            >
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">
                  {isId ? "Ringkasan analisis" : "Analysis summary"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <StockStatusBadge status={item.stockStatus} />
                  <MovementBadge movement={item.movementClass} />
                  <PriorityBadge priority={item.purchasePriority} />
                </div>
                <div className="grid gap-3 text-sm text-muted-foreground">
                  <p>{isId ? "Kode" : "Code"}: {item.itemCode}</p>
                  <p>{isId ? "Kategori" : "Category"}: {item.category ?? "-"}</p>
                  <p>Brand: {item.brand ?? "-"}</p>
                  <p>
                    {isId ? "Coverage" : "Coverage"}:{" "}
                    {item.coverageDays == null ? "-" : `${formatNumber(item.coverageDays)} ${isId ? "hari" : "days"}`}
                  </p>
                </div>
                <div className="space-y-2 rounded-[22px] border border-slate-950/8 bg-slate-50/70 p-4 dark:border-white/8 dark:bg-white/4">
                  <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                    {isId ? "Alasan analisis" : "Analysis reasons"}
                  </p>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    {item.reasons.map((reason: string) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card
              data-reveal-item
              className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
            >
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-950 dark:text-white">
                  {isId ? "Riwayat penjualan aktif" : "Active sales history"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...(query.data?.summaryHistory ?? []), ...(query.data?.transactionHistory ?? [])]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="qty" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card
      data-reveal-item
      className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
    >
      <CardContent className="space-y-2 p-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
