import { Input } from "@Manujujaya-Manajemen-stock/ui/components/input";
import { Label } from "@Manujujaya-Manajemen-stock/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { DataTable } from "@/components/data-table";
import { useLanguage } from "@/components/language-provider";
import { PageHeader } from "@/components/page-header";
import { MovementBadge, PriorityBadge, StockStatusBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

type PurchaseResponse = Awaited<ReturnType<typeof orpc.purchase.list.call>>;

export const Route = createFileRoute("/high-priority-stock")({
  component: HighPriorityStockPage,
});

function HighPriorityStockPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery(
    orpc.purchase.list.queryOptions({
      input: {
        search,
        purchasePriority: "High",
        page,
        pageSize: 12,
        sortBy: "priorityScore",
        sortDirection: "desc",
      },
    }),
  );

  const columns: ColumnDef<PurchaseResponse["items"][number]>[] = [
    {
      header: isId ? "Product Code (SKU)" : "Product Code (SKU)",
      cell: ({ row }) => (
        <Link
          to="/items/$itemId"
          params={{ itemId: row.original.itemCode }}
          className="font-mono text-xs text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
        >
          {row.original.itemCode}
        </Link>
      ),
    },
    {
      header: isId ? "Nama barang" : "Item name",
      cell: ({ row }) => (
        <Link
          to="/items/$itemId"
          params={{ itemId: row.original.itemCode }}
          className="font-medium text-slate-950 hover:underline dark:text-white"
        >
          {row.original.itemName}
        </Link>
      ),
    },
    {
      header: isId ? "Status" : "Status",
      cell: ({ row }) => <StockStatusBadge status={row.original.stockStatus} />,
    },
    {
      header: isId ? "Keterjualan" : "Selling speed",
      cell: ({ row }) => <MovementBadge movement={row.original.movementClass} />,
    },
    {
      header: isId ? "Prioritas" : "Priority",
      cell: ({ row }) => <PriorityBadge priority={row.original.purchasePriority} />,
    },
    {
      header: isId ? "Stok saat ini" : "Current stock",
      cell: ({ row }) => formatNumber(row.original.currentStock, 0),
    },
    {
      header: isId ? "Saran beli" : "Suggested buy",
      cell: ({ row }) => formatNumber(row.original.recommendedOrderQty, 0),
    },
  ];

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Stok High Priority" : "High Priority Stock"}
        title={
          isId
            ? "Daftar stok prioritas tinggi untuk tindakan cepat"
            : "High-priority stock list for fast action"
        }
        description={
          isId
            ? "Halaman ini menampilkan hanya item prioritas tinggi dan fokus pada Product Code (SKU) agar pencarian barang kosong lebih cepat."
            : "This page shows only high-priority items and highlights Product Code (SKU) for faster out-of-stock lookup."
        }
      />

      <section
        data-reveal-item
        className="grid gap-2 rounded-[28px] border border-slate-950/8 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/8 dark:bg-[#121212]/70"
      >
        <Label>{isId ? "Cari nama barang atau Product Code (SKU)" : "Search item name or Product Code (SKU)"}</Label>
        <Input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder={isId ? "Contoh: Busi, OLI-001, SKU-123" : "Example: Spark Plug, OIL-001, SKU-123"}
        />
      </section>

      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        page={query.data?.page ?? 1}
        pageSize={query.data?.pageSize ?? 12}
        total={query.data?.total ?? 0}
        onPageChange={setPage}
        emptyMessage={
          isId
            ? "Tidak ada item prioritas tinggi untuk filter saat ini."
            : "No high-priority items found for the current filter."
        }
      />
    </div>
  );
}
