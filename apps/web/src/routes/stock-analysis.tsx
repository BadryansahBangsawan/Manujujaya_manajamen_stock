import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
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
import { StockStatusBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

type InventoryResponse = Awaited<ReturnType<typeof orpc.inventory.list.call>>;

export const Route = createFileRoute("/stock-analysis")({
  component: StockAnalysisPage,
});

function StockAnalysisPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const [search, setSearch] = React.useState("");
  const [stockStatus, setStockStatus] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery(
    orpc.inventory.list.queryOptions({
      input: {
        search,
        stockStatus: stockStatus ? (stockStatus as "Kosong" | "Rendah" | "Aman") : null,
        category: category || null,
        page,
        pageSize: 15,
        sortBy: "currentStock",
        sortDirection: "asc",
      },
    }),
  );

  const data = query.data;

  const columns: ColumnDef<InventoryResponse["items"][number]>[] = [
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
      header: isId ? "Kategori" : "Category",
      accessorKey: "category",
      cell: ({ row }) => row.original.category ?? "-",
    },
    {
      header: "Brand",
      accessorKey: "brand",
      cell: ({ row }) => row.original.brand ?? "-",
    },
    {
      header: isId ? "Stok" : "Stock",
      cell: ({ row }) => formatNumber(row.original.currentStock, 0),
    },
    {
      header: "Coverage",
      cell: ({ row }) =>
        row.original.coverageDays == null ? "-" : `${formatNumber(row.original.coverageDays)} ${isId ? "hari" : "days"}`,
    },
    {
      header: isId ? "Status" : "Status",
      cell: ({ row }) => <StockStatusBadge status={row.original.stockStatus} />,
    },
  ];

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Analisis Stok" : "Stock Analysis"}
        title={isId ? "Pantau barang kosong, kritis, dan stok aman dalam satu alur" : "Monitor out-of-stock, critical, and safe stock in one flow"}
        description={
          isId
            ? "Filter berdasarkan kategori atau status stok untuk langsung melihat item yang butuh tindakan."
            : "Filter by category or stock status to immediately find items that need action."
        }
      />

      <section data-reveal-item className="grid gap-4 rounded-[28px] border border-slate-950/8 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/8 dark:bg-[#121212]/70 lg:grid-cols-3">
        <div className="grid gap-2">
          <Label>{isId ? "Pencarian barang" : "Item search"}</Label>
          <Input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder={isId ? "Cari nama, kode, kategori" : "Search by name, code, category"}
          />
        </div>
        <div className="grid gap-2">
          <Label>{isId ? "Status stok" : "Stock status"}</Label>
          <Select
            value={stockStatus}
            onChange={(event) => {
              setPage(1);
              setStockStatus(event.target.value);
            }}
          >
            <option value="">{isId ? "Semua status" : "All statuses"}</option>
            <option value="Kosong">{isId ? "Kosong" : "Out of stock"}</option>
            <option value="Rendah">{isId ? "Rendah" : "Low"}</option>
            <option value="Aman">{isId ? "Aman" : "Safe"}</option>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>{isId ? "Kategori" : "Category"}</Label>
          <Select
            value={category}
            onChange={(event) => {
              setPage(1);
              setCategory(event.target.value);
            }}
          >
            <option value="">{isId ? "Semua kategori" : "All categories"}</option>
            {(data?.availableFilters.categories ?? []).filter(
              (value): value is string => Boolean(value),
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 15}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
