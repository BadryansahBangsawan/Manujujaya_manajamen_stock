import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@Manujujaya-Manajemen-stock/ui/components/table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData>[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
};

export function DataTable<TData>({
  data,
  columns,
  page,
  pageSize,
  total,
  onPageChange,
  emptyMessage = "Belum ada data untuk ditampilkan.",
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div data-reveal-item className="overflow-hidden rounded-[28px] border border-slate-950/8 bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/8 dark:bg-[#121212]/70">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell className="h-28 text-center text-muted-foreground" colSpan={columns.length}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Menampilkan <span className="font-semibold text-foreground">{data.length}</span> dari{" "}
          <span className="font-semibold text-foreground">{total}</span> baris
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            Sebelumnya
          </Button>
          <span className="min-w-20 text-center text-xs text-muted-foreground">
            Hal. {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  );
}
