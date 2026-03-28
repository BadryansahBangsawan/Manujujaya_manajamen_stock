import { Input } from "@Manujujaya-Manajemen-stock/ui/components/input";
import { Label } from "@Manujujaya-Manajemen-stock/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { DataTable } from "@/components/data-table";
import { useLanguage } from "@/components/language-provider";
import { PageHeader } from "@/components/page-header";
import { MovementBadge, PriorityBadge } from "@/components/status-badge";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatNumber } from "@/lib/format";
import { orpc } from "@/utils/orpc";

type SlowResponse = Awaited<ReturnType<typeof orpc.slowMoving.list.call>>;

export const Route = createFileRoute("/slow-moving")({
  component: SlowMovingPage,
});

function SlowMovingPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  const query = useQuery(
    orpc.slowMoving.list.queryOptions({
      input: {
        search,
        page,
        pageSize: 12,
        sortBy: "coverageDays",
        sortDirection: "desc",
      },
    }),
  );

  const columns: ColumnDef<SlowResponse["items"][number]>[] = [
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
      header: isId ? "Stok" : "Stock",
      cell: ({ row }) => formatNumber(row.original.currentStock, 0),
    },
    {
      header: isId ? "Qty aktif" : "Active qty",
      cell: ({ row }) => formatNumber(row.original.qtyTotal, 0),
    },
    {
      header: "Coverage",
      cell: ({ row }) =>
        row.original.coverageDays == null ? "-" : `${formatNumber(row.original.coverageDays)} ${isId ? "hari" : "days"}`,
    },
    {
      header: "Movement",
      cell: ({ row }) => <MovementBadge movement={row.original.movementClass} />,
    },
    {
      header: isId ? "Prioritas" : "Priority",
      cell: ({ row }) => <PriorityBadge priority={row.original.purchasePriority} />,
    },
  ];

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Slow Moving" : "Slow Moving"}
        title={isId ? "Lacak item yang terlalu lama diam di rak" : "Track items staying too long on shelf"}
        description={
          isId
            ? "Gunakan halaman ini untuk mengidentifikasi stok yang berlebih, demand yang rendah, dan barang mati yang menahan modal."
            : "Use this page to identify overstock, low-demand items, and dead stock locking your capital."
        }
      />

      <section data-reveal-item className="grid gap-2 rounded-[28px] border border-slate-950/8 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/8 dark:bg-[#121212]/70">
        <Label>{isId ? "Pencarian slow / dead moving" : "Slow / dead moving search"}</Label>
        <Input
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder={isId ? "Cari item dengan pergerakan rendah" : "Search low-movement items"}
        />
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
