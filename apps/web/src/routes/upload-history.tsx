import { Badge } from "@Manujujaya-Manajemen-stock/ui/components/badge";
import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { Card, CardContent } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { Checkbox } from "@Manujujaya-Manajemen-stock/ui/components/checkbox";
import { Label } from "@Manujujaya-Manajemen-stock/ui/components/label";
import { Separator } from "@Manujujaya-Manajemen-stock/ui/components/separator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { formatDateRange } from "@/lib/format";
import { useLanguage } from "@/components/language-provider";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/upload-history")({
  component: UploadHistoryPage,
});

function UploadHistoryPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();
  const queryClient = useQueryClient();
  const historyQuery = useQuery(orpc.uploads.listHistory.queryOptions());
  const batches = historyQuery.data ?? [];

  const [masterBatchId, setMasterBatchId] = React.useState<string | null>(null);
  const [salesBatchIds, setSalesBatchIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (batches.length === 0) return;
    setMasterBatchId(
      batches.find((batch: any) => batch.datasetType === "master" && batch.isActive)?.id ?? null,
    );
    setSalesBatchIds(
      batches
        .filter((batch: any) => batch.datasetType !== "master" && batch.isActive)
        .map((batch: any) => batch.id),
    );
  }, [batches]);

  const activateMutation = useMutation({
    mutationFn: (input: Parameters<typeof orpc.uploads.setActiveBatches.call>[0]) =>
      orpc.uploads.setActiveBatches.call(input),
    onSuccess: async () => {
      toast.success(isId ? "Snapshot aktif diperbarui." : "Active snapshot updated.");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (input: Parameters<typeof orpc.uploads.deleteBatch.call>[0]) =>
      orpc.uploads.deleteBatch.call(input),
    onSuccess: async (result) => {
      setMasterBatchId((current) => (current === result.deletedBatchId ? null : current));
      setSalesBatchIds((current) => current.filter((id) => id !== result.deletedBatchId));
      toast.success(isId ? "Batch berhasil dihapus." : "Batch deleted.");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const masterBatches = batches.filter((batch: any) => batch.datasetType === "master");
  const salesBatches = batches.filter((batch: any) => batch.datasetType !== "master");

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Histori Upload" : "Upload History"}
        title={isId ? "Kelola batch aktif untuk membentuk snapshot analitik" : "Manage active batches to build analytics snapshot"}
        description={
          isId
            ? "Aktifkan satu master barang dan pilih beberapa batch sales yang ingin ikut dihitung pada dashboard."
            : "Activate one master inventory batch and choose several sales batches to include in dashboard calculations."
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <BatchColumn
          title={isId ? "Master barang" : "Master inventory"}
          batches={masterBatches}
          selectedId={masterBatchId}
          onSelect={(value) => setMasterBatchId(value)}
          onDelete={(batchId) => {
            if (!window.confirm(isId ? "Hapus batch ini dari history?" : "Delete this batch from history?")) return;
            deleteMutation.mutate({ batchId });
          }}
          deletingBatchId={deleteMutation.isPending ? deleteMutation.variables?.batchId ?? null : null}
          multiple={false}
        />
        <BatchColumn
          title={isId ? "Batch sales aktif" : "Active sales batches"}
          batches={salesBatches}
          selectedIds={salesBatchIds}
          onToggle={(value) =>
            setSalesBatchIds((current) =>
              current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
            )
          }
          onDelete={(batchId) => {
            if (!window.confirm(isId ? "Hapus batch ini dari history?" : "Delete this batch from history?")) return;
            deleteMutation.mutate({ batchId });
          }}
          deletingBatchId={deleteMutation.isPending ? deleteMutation.variables?.batchId ?? null : null}
          multiple
        />
      </div>

      <div data-reveal-item className="flex justify-end">
        <Button
          className="rounded-full px-6"
          disabled={activateMutation.isPending}
          onClick={() => activateMutation.mutate({ masterBatchId, salesBatchIds })}
        >
          {isId ? "Terapkan snapshot aktif" : "Apply active snapshot"}
        </Button>
      </div>
    </div>
  );
}

function BatchColumn({
  title,
  batches,
  selectedId,
  selectedIds,
  onSelect,
  onToggle,
  onDelete,
  deletingBatchId,
  multiple,
}: {
  title: string;
  batches: any[];
  selectedId?: string | null;
  selectedIds?: string[];
  onSelect?: (value: string) => void;
  onToggle?: (value: string) => void;
  onDelete?: (value: string) => void;
  deletingBatchId?: string | null;
  multiple: boolean;
}) {
  const { language } = useLanguage();
  const isId = language === "id";

  return (
    <Card
      data-reveal-item
      className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
    >
      <CardContent className="space-y-5 p-6">
        <p className="text-lg font-semibold text-slate-950 dark:text-white">{title}</p>
        {batches.map((batch, index) => (
          <React.Fragment key={batch.id}>
            <div className="flex items-start gap-3">
              {multiple ? (
                <Checkbox
                  checked={selectedIds?.includes(batch.id)}
                  onCheckedChange={() => onToggle?.(batch.id)}
                />
              ) : (
                <input
                  type="radio"
                  name="master-batch"
                  checked={selectedId === batch.id}
                  onChange={() => onSelect?.(batch.id)}
                  className="mt-1 size-4"
                />
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-950 dark:text-white">{batch.filename}</p>
                  {batch.isActive ? <Badge variant="success">{isId ? "aktif" : "active"}</Badge> : null}
                  {batch.filename.startsWith("demo-") ? <Badge variant="outline">demo</Badge> : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                    disabled={deletingBatchId === batch.id}
                    onClick={() => onDelete?.(batch.id)}
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    {deletingBatchId === batch.id ? (isId ? "Menghapus..." : "Deleting...") : isId ? "Hapus" : "Delete"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {batch.datasetType} • {batch.rowCount} rows • {formatDateRange(batch.periodStart, batch.periodEnd)}
                </p>
              </div>
            </div>
            {index < batches.length - 1 ? <Separator /> : null}
          </React.Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
