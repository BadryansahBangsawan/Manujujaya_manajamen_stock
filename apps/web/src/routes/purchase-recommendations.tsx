import { Input } from "@Manujujaya-Manajemen-stock/ui/components/input";
import { Label } from "@Manujujaya-Manajemen-stock/ui/components/label";
import { Select } from "@Manujujaya-Manajemen-stock/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { DataTable } from "@/components/data-table";
import { useLanguage } from "@/components/language-provider";
import { PageHeader } from "@/components/page-header";
import { MovementBadge, PriorityBadge, StockStatusBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatCurrency, formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

type PurchaseResponse = Awaited<ReturnType<typeof orpc.purchase.list.call>>;

export const Route = createFileRoute("/purchase-recommendations")({
  component: PurchaseRecommendationsPage,
});

function PurchaseRecommendationsPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const [search, setSearch] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery(
    orpc.purchase.list.queryOptions({
      input: {
        search,
        purchasePriority: priority ? (priority as "High" | "Medium" | "Low") : null,
        page,
        pageSize: 12,
        sortBy: "priorityScore",
        sortDirection: "desc",
      },
    }),
  );

  const columns: ColumnDef<PurchaseResponse["items"][number]>[] = [
    {
      header: isId ? "Barang" : "Item",
      cell: ({ row }) => (
        <div className="space-y-1">
          <Link
            to="/items/$itemId"
            params={{ itemId: row.original.itemCode }}
            className="font-medium text-slate-950 hover:underline dark:text-white"
          >
            {row.original.itemName}
          </Link>
          <p className="text-xs text-muted-foreground">{row.original.itemCode}</p>
        </div>
      ),
    },
    {
      header: isId ? "Status" : "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <StockStatusBadge status={row.original.stockStatus} />
          <PriorityBadge priority={row.original.purchasePriority} />
        </div>
      ),
    },
    {
      header: isId ? "Keterjualan" : "Selling speed",
      cell: ({ row }) => <MovementBadge movement={row.original.movementClass} />,
    },
    {
      header: isId ? "Qty 3 bulan" : "3-month qty",
      cell: ({ row }) => formatNumber(row.original.qtyTotal, 0),
    },
    {
      header: isId ? "Saran beli" : "Suggested buy",
      cell: ({ row }) => formatNumber(row.original.recommendedOrderQty, 0),
    },
    {
      header: isId ? "Nilai estimasi" : "Estimated value",
      cell: ({ row }) =>
        row.original.basePrice == null
          ? isId ? "Parsial" : "Partial"
          : formatCurrency(row.original.recommendedOrderQty * row.original.basePrice),
    },
    {
      header: isId ? "Alasan" : "Reason",
      cell: ({ row }) => (
        <p className="max-w-xs text-xs leading-6 text-muted-foreground">
          {row.original.reasons.join(" • ")}
        </p>
      ),
    },
  ];

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Prioritas Beli" : "Buy Priority"}
        title={
          isId
            ? "Rank rekomendasi pembelian yang menggabungkan stok, demand, dan tingkat keterjualan"
            : "Purchase recommendation ranking based on stock, demand, and selling speed"
        }
        description={
          isId
            ? "Fokuskan modal ke item paling berisiko habis sekaligus paling cepat terjual pada coverage aktif."
            : "Focus capital on items with highest stock-out risk and strongest selling speed in active coverage."
        }
      />

      <section data-reveal-item className="grid gap-4 rounded-[28px] border border-slate-950/8 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/8 dark:bg-[#121212]/70 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label>{isId ? "Pencarian" : "Search"}</Label>
          <Input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder={isId ? "Cari item prioritas" : "Search priority items"}
          />
        </div>
        <div className="grid gap-2">
          <Label>{isId ? "Prioritas" : "Priority"}</Label>
          <Select
            value={priority}
            onChange={(event) => {
              setPage(1);
              setPriority(event.target.value);
            }}
          >
            <option value="">{isId ? "Semua prioritas" : "All priorities"}</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </Select>
        </div>
      </section>

      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        page={query.data?.page ?? 1}
        pageSize={query.data?.pageSize ?? 12}
        total={query.data?.total ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
