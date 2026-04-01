import { Alert, AlertDescription, AlertTitle } from "@Manujujaya-Manajemen-stock/ui/components/alert";
import { Badge } from "@Manujujaya-Manajemen-stock/ui/components/badge";
import { Button } from "@Manujujaya-Manajemen-stock/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Manujujaya-Manajemen-stock/ui/components/card";
import { Input } from "@Manujujaya-Manajemen-stock/ui/components/input";
import { Label } from "@Manujujaya-Manajemen-stock/ui/components/label";
import { Select } from "@Manujujaya-Manajemen-stock/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@Manujujaya-Manajemen-stock/ui/components/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import { parseSpreadsheet } from "@/lib/upload";
import { orpc } from "@/utils/orpc";

type UploadWorkbenchProps = {
  datasetType: "master" | "sales";
  title: string;
  description: string;
};

type PreviewResponse = Awaited<ReturnType<typeof orpc.uploads.previewFile.call>>;
const PREVIEW_SAMPLE_ROWS = 250;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isRetryableUploadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("503") ||
    message.includes("Failed to fetch") ||
    message.includes("Internal server error")
  );
};

function dedupeRowsByHeader(
  rows: Array<Record<string, unknown>>,
  header: string | null | undefined,
) {
  if (!header) return rows;
  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row[header] ?? "").trim();
    if (!key) continue;
    deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function compactRowsByMapping(
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, string | null | undefined>,
) {
  const selectedHeaders = Array.from(
    new Set(
      Object.values(mapping)
        .filter((header): header is string => typeof header === "string" && header.length > 0),
    ),
  );
  if (selectedHeaders.length === 0) return rows;

  return rows.map((row) => {
    const compacted: Record<string, unknown> = {};
    for (const header of selectedHeaders) {
      compacted[header] = row[header] ?? null;
    }
    return compacted;
  });
}

export function UploadWorkbench({ datasetType, title, description }: UploadWorkbenchProps) {
  const { language } = useLanguage();
  const isId = language === "id";
  const queryClient = useQueryClient();
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [payload, setPayload] = React.useState<Awaited<ReturnType<typeof parseSpreadsheet>> | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string | null>>({});
  const [periodStart, setPeriodStart] = React.useState("");
  const [periodEnd, setPeriodEnd] = React.useState("");
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);

  const previewMutation = useMutation({
    mutationFn: (input: Parameters<typeof orpc.uploads.previewFile.call>[0]) =>
      orpc.uploads.previewFile.call(input),
    onSuccess: (result) => {
      setUploadProgress(null);
      setPreview(result);
      setMapping(
        Object.fromEntries(
          Object.entries(result.suggestedMapping).map(([field, header]) => [field, header ?? null]),
        ),
      );
      setPeriodStart(result.inferredPeriodStart ?? "");
      setPeriodEnd(result.inferredPeriodEnd ?? "");
    },
    onError: (error) => {
      const message = error.message.includes("Failed to fetch")
        ? "Gagal terhubung ke server. Pastikan backend aktif di http://localhost:3000 dan CORS mengizinkan origin web."
        : error.message;
      toast.error(message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!payload || !preview) throw new Error("Belum ada file yang dipreview.");
      let startedBatchId: string | null = null;
      const isMasterAutoMapping = preview.detectedDatasetType === "master";
      const mappedFields = isMasterAutoMapping ? preview.suggestedMapping : mapping;

      try {
        if (preview.detectedDatasetType === "master") {
          const uniqueMasterRows = dedupeRowsByHeader(payload.rows, mappedFields.item_code);
          const preparedMasterRows = compactRowsByMapping(uniqueMasterRows, mappedFields);
          const started = await orpc.uploads.startMasterImport.call({
            fileName: payload.fileName,
            rowCount: preparedMasterRows.length,
            mapping: mappedFields,
          });
          startedBatchId = started.batchId;

          const totalRows = Math.max(preparedMasterRows.length, 1);
          let chunkSize = 300;
          const minimumChunkSize = 20;
          let processed = 0;
          setUploadProgress(0);

          const appendChunkWithRetry = async (
            rowsChunk: Array<Record<string, unknown>>,
            attempt = 0,
          ): Promise<void> => {
            try {
              await orpc.uploads.appendMasterChunk.call({
                batchId: started.batchId,
                rows: rowsChunk,
                mapping: mappedFields,
              });
            } catch (error) {
              const isRetryable = isRetryableUploadError(error);

              if (isRetryable && rowsChunk.length > 20) {
                const middle = Math.ceil(rowsChunk.length / 2);
                await appendChunkWithRetry(rowsChunk.slice(0, middle), attempt);
                await appendChunkWithRetry(rowsChunk.slice(middle), attempt);
                return;
              }

              if (isRetryable && attempt < 5) {
                await sleep(700 * (attempt + 1));
                await appendChunkWithRetry(rowsChunk, attempt + 1);
                return;
              }

              throw error;
            }
          };

          for (let index = 0; index < preparedMasterRows.length; ) {
            const rowsChunk = preparedMasterRows.slice(index, index + chunkSize);
            try {
              await appendChunkWithRetry(rowsChunk);
              index += rowsChunk.length;
              processed += rowsChunk.length;
              setUploadProgress(Math.min(100, Math.round((processed / totalRows) * 100)));
              await sleep(80);
            } catch (error) {
              if (isRetryableUploadError(error) && chunkSize > minimumChunkSize) {
                chunkSize = Math.max(minimumChunkSize, Math.floor(chunkSize / 2));
                continue;
              }
              throw error;
            }
          }

          const finalized = await orpc.uploads.finalizeMasterImport.call({ batchId: started.batchId });
          startedBatchId = null;
          return finalized;
        }

        if (preview.detectedDatasetType === "sales_summary") {
          if (!periodStart || !periodEnd) {
            throw new Error("Period start dan period end wajib diisi untuk sales summary.");
          }

          const preparedSalesRows = compactRowsByMapping(payload.rows, mappedFields);
          const started = await orpc.uploads.startSalesSummaryImport.call({
            fileName: payload.fileName,
            rowCount: preparedSalesRows.length,
            mapping: mappedFields,
            periodStart,
            periodEnd,
          });
          startedBatchId = started.batchId;

          const totalRows = Math.max(preparedSalesRows.length, 1);
          let chunkSize = 200;
          const minimumChunkSize = 20;
          let processed = 0;
          setUploadProgress(0);

          const appendSalesChunkWithRetry = async (
            rowsChunk: Array<Record<string, unknown>>,
            attempt = 0,
          ): Promise<void> => {
            try {
              await orpc.uploads.appendSalesSummaryChunk.call({
                batchId: started.batchId,
                rows: rowsChunk,
                mapping: mappedFields,
              });
            } catch (error) {
              const isRetryable = isRetryableUploadError(error);

              if (isRetryable && rowsChunk.length > 20) {
                const middle = Math.ceil(rowsChunk.length / 2);
                await appendSalesChunkWithRetry(rowsChunk.slice(0, middle), attempt);
                await appendSalesChunkWithRetry(rowsChunk.slice(middle), attempt);
                return;
              }

              if (isRetryable && attempt < 5) {
                await sleep(700 * (attempt + 1));
                await appendSalesChunkWithRetry(rowsChunk, attempt + 1);
                return;
              }

              throw error;
            }
          };

          for (let index = 0; index < preparedSalesRows.length; ) {
            const rowsChunk = preparedSalesRows.slice(index, index + chunkSize);
            try {
              await appendSalesChunkWithRetry(rowsChunk);
              index += rowsChunk.length;
              processed += rowsChunk.length;
              setUploadProgress(Math.min(100, Math.round((processed / totalRows) * 100)));
              await sleep(60);
            } catch (error) {
              if (isRetryableUploadError(error) && chunkSize > minimumChunkSize) {
                chunkSize = Math.max(minimumChunkSize, Math.floor(chunkSize / 2));
                continue;
              }
              throw error;
            }
          }

          const finalized = await orpc.uploads.finalizeSalesSummaryImport.call({ batchId: started.batchId });
          startedBatchId = null;
          return finalized;
        }

        const request = {
          ...payload,
          datasetType,
          mapping: mappedFields,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        };

        if (preview.detectedDatasetType === "sales_transaction") {
          return orpc.uploads.commitSalesTransaction.call(request);
        }
        return orpc.uploads.commitSalesSummary.call(request);
      } catch (error) {
        if (startedBatchId) {
          await orpc.uploads.deleteBatch
            .call({ batchId: startedBatchId })
            .catch(() => {});
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setUploadProgress(null);
      toast.success(isId ? "Data berhasil diimpor." : "Data imported successfully.");
      await queryClient.invalidateQueries({ refetchType: "none" });
    },
    onError: (error) => {
      setUploadProgress(null);
      const message = error.message.includes("Failed to fetch")
        ? "Gagal mengirim data ke server. Cek koneksi backend/CORS lalu coba lagi."
        : error.message;
      toast.error(message);
    },
  });

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setUploadProgress(null);
    const parsed = await parseSpreadsheet(file);
    setPayload(parsed);
    await previewMutation.mutateAsync({
      ...parsed,
      rows: parsed.rows.slice(0, PREVIEW_SAMPLE_ROWS),
      datasetType,
      totalRows: parsed.totalRows ?? parsed.rows.length,
    });
  }

  const headerOptions = payload?.headers ?? [];
  const isMasterAutoMapping = preview?.detectedDatasetType === "master";
  const progressLabel =
    preview?.detectedDatasetType === "master"
      ? isId
        ? "Progress upload master"
        : "Master upload progress"
      : isId
        ? "Progress upload sales"
        : "Sales upload progress";

  return (
    <Card
      data-reveal-item
      className="rounded-[28px] border-none bg-white/80 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.55)] ring-1 ring-slate-950/6 backdrop-blur dark:bg-[#121212]/70 dark:ring-white/8"
    >
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#353535]/20 bg-[#353535] px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-white uppercase dark:border-[#353535]/40 dark:bg-[#353535] dark:text-white">
              <UploadCloud className="size-3.5" />
              {datasetType}
            </div>
            <CardTitle className="text-2xl font-semibold text-slate-950 dark:text-white">
              {title}
            </CardTitle>
            <CardDescription className="max-w-2xl">{description}</CardDescription>
          </div>
          {preview ? (
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline">{preview.rowCount} rows</Badge>
              <Badge variant="secondary">{preview.detectedDatasetType}</Badge>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-2">
            <Label htmlFor={`${datasetType}-file`}>{isId ? "Pilih file Excel / CSV" : "Choose Excel / CSV file"}</Label>
            <Input
              id={`${datasetType}-file`}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="rounded-[24px] border border-[#353535]/20 bg-[#353535] p-4 text-slate-100 dark:border-[#353535]/40">
            <div className="flex items-center gap-3 text-sm font-medium">
              <FileSpreadsheet className="size-4" />
              {payload?.fileName ?? (isId ? "Belum ada file dipilih" : "No file selected")}
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-300">
              {isId
                ? "Preview dan validasi dilakukan sebelum data dimasukkan ke histori upload aktif."
                : "Preview and validation run before data is saved to active upload history."}
            </p>
          </div>
        </div>

        {preview?.missingRequiredFields.length ? (
          <Alert variant="warning">
            <AlertTitle>{isId ? "Mapping belum lengkap" : "Mapping is incomplete"}</AlertTitle>
            <AlertDescription>
              {isId ? "Field wajib yang belum cocok" : "Missing required fields"}: {preview.missingRequiredFields.join(", ")}
            </AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <div className="grid gap-4 rounded-[24px] border border-slate-950/8 bg-slate-50/70 p-5 dark:border-white/8 dark:bg-white/4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">Mapping Kolom</p>
                  <Badge variant="outline">{preview.detectedDatasetType}</Badge>
                </div>
                {isMasterAutoMapping ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTitle>Auto mapping aktif untuk file master</AlertTitle>
                      <AlertDescription>
                        {isId
                          ? "Mapping product dilakukan otomatis dari preset header. Anda bisa langsung simpan."
                          : "Product mapping is applied automatically from header presets. You can save directly."}
                      </AlertDescription>
                    </Alert>
                    <div className="grid gap-4">
                      {preview.requiredFields.map((field) => (
                        <div key={field} className="grid gap-2">
                          <Label>{field}</Label>
                          <div className="rounded-xl border border-slate-950/10 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/12 dark:bg-[#121212] dark:text-slate-100">
                            {preview.suggestedMapping[field] ?? "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {preview.requiredFields.map((field) => (
                      <div key={field} className="grid gap-2">
                        <Label>{field}</Label>
                        <Select
                          value={mapping[field] ?? ""}
                          onChange={(event) =>
                            setMapping((current) => ({ ...current, [field]: event.target.value || null }))
                          }
                        >
                          <option value="">{isId ? "Pilih kolom" : "Select column"}</option>
                          {headerOptions.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {preview.detectedDatasetType === "sales_summary" ? (
                <div className="grid gap-4 rounded-[24px] border border-slate-950/8 bg-slate-50/70 p-5 dark:border-white/8 dark:bg-white/4">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">
                    {isId ? "Periode cakupan" : "Coverage period"}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`${datasetType}-period-start`}>{isId ? "Tanggal awal periode" : "Period start"}</Label>
                      <Input
                        id={`${datasetType}-period-start`}
                        type="date"
                        value={periodStart}
                        onChange={(event) => setPeriodStart(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${datasetType}-period-end`}>{isId ? "Tanggal akhir periode" : "Period end"}</Label>
                      <Input
                        id={`${datasetType}-period-end`}
                        type="date"
                        value={periodEnd}
                        onChange={(event) => setPeriodEnd(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <Button
                className="w-full rounded-full"
                disabled={commitMutation.isPending || preview.missingRequiredFields.length > 0}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending
                  ? isId ? "Mengimpor..." : "Importing..."
                  : isId ? "Simpan ke snapshot aktif" : "Save to active snapshot"}
              </Button>
              {uploadProgress != null && commitMutation.isPending ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {progressLabel}: {uploadProgress}%
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-[#353535] transition-[width] duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {(payload?.metadataLines ?? []).slice(0, 3).map((line) => (
                  <Badge key={line} variant="secondary">
                    {line}
                  </Badge>
                ))}
              </div>
              <div className="overflow-hidden rounded-[24px] border border-slate-950/8 dark:border-white/8">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headerOptions.slice(0, 6).map((header) => (
                          <TableHead key={header}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.previewRows.map((row, index) => (
                        <TableRow key={`${index}-${datasetType}`}>
                          {headerOptions.slice(0, 6).map((header) => (
                            <TableCell key={header} className="max-w-[220px] truncate">
                              {String(row[header] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
