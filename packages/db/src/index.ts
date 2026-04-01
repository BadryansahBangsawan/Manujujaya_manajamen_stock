import { createClient, type Client as LibsqlClient } from "@libsql/client";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";

import { demoInventoryItems, demoSummaryBatches, demoTransactionRecords } from "./demo-data";
import {
  analysisItems,
  analysisSummary,
  inventoryItems,
  salesSummaryRecords,
  salesTransactionRecords,
  uploadBatches,
  type AnalysisItem,
  type AnalysisSummary,
  type UploadBatch,
} from "./schema";

function resolveDefaultDbPath() {
  try {
    if (typeof import.meta !== "undefined" && typeof import.meta.url === "string" && import.meta.url.startsWith("file:")) {
      return new URL("../local.db", import.meta.url).pathname;
    }
  } catch {
    // ignore and fallback for non-file runtimes (e.g. Cloudflare Worker bundle)
  }

  return "./local.db";
}

const DEFAULT_DB_PATH = resolveDefaultDbPath();
const DEMO_SUMMARY_PREFIX = "demo-sales";

export type DatasetType = "master" | "sales_summary" | "sales_transaction";
export type UploadMode = "master" | "sales";
export type StockStatus = "Kosong" | "Rendah" | "Aman";
export type MovementClass = "Fast Moving" | "Medium Moving" | "Slow Moving" | "Dead Moving";
export type PurchasePriority = "High" | "Medium" | "Low";

export type PreviewPayload = {
  fileName: string;
  datasetType: UploadMode;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  metadataLines?: string[];
  totalRows?: number;
};

export type UploadMapping = Record<string, string | null | undefined>;

export type CommitPayload = PreviewPayload & {
  mapping: UploadMapping;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type StartMasterUploadPayload = {
  fileName: string;
  rowCount: number;
  mapping: UploadMapping;
};

export type AppendMasterUploadChunkPayload = {
  batchId: string;
  rows: Array<Record<string, unknown>>;
  mapping: UploadMapping;
};

export type StartSalesSummaryUploadPayload = {
  fileName: string;
  rowCount: number;
  mapping: UploadMapping;
  periodStart: string;
  periodEnd: string;
};

export type AppendSalesSummaryChunkPayload = {
  batchId: string;
  rows: Array<Record<string, unknown>>;
  mapping: UploadMapping;
};

export type ListFilters = {
  search?: string;
  brand?: string | null;
  category?: string | null;
  stockStatus?: StockStatus | null;
  purchasePriority?: PurchasePriority | null;
  movementClass?: MovementClass | null;
  sortBy?:
    | "priorityScore"
    | "qtyTotal"
    | "currentStock"
    | "itemName"
    | "salesValueTotal"
    | "coverageDays";
  sortDirection?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ChartPoint = { label: string; value: number };
export type TrendPoint = { label: string; qty: number; sales: number };

type AggregatedSales = {
  qtyTotal: number;
  salesValueTotal: number;
  frequencyScore: number;
  category?: string | null;
  itemName?: string | null;
  periods: Set<string>;
};

type AnalysisComputation = {
  summary: {
    totalItems: number;
    totalOutOfStock: number;
    totalLowStock: number;
    totalFastMoving: number;
    totalSlowMoving: number;
    totalDeadMoving: number;
    totalPriorityBuy: number;
    estimatedRestockValue: number;
    hasPartialCosting: boolean;
    coverageStart: string | null;
    coverageEnd: string | null;
    coverageDays: number;
    stockDistribution: ChartPoint[];
    movementDistribution: ChartPoint[];
  };
  items: Array<{
    itemCode: string;
    itemName: string;
    category: string | null;
    brand: string | null;
    currentStock: number;
    minimumStock: number | null;
    basePrice: number | null;
    qtyTotal: number;
    salesValueTotal: number;
    periodDays: number;
    periodCount: number;
    frequencyScore: number;
    avgMonthlySales: number;
    avgDailySales: number;
    coverageDays: number | null;
    stockStatus: StockStatus;
    movementClass: MovementClass;
    purchasePriority: PurchasePriority;
    recommendedOrderQty: number;
    priorityScore: number;
    reasons: string[];
    deadStockFlag: boolean;
  }>;
};

const schema = {
  uploadBatches,
  inventoryItems,
  salesSummaryRecords,
  salesTransactionRecords,
  analysisItems,
  analysisSummary,
};

type D1Binding = Parameters<typeof drizzleD1>[0];

let configuredD1: D1Binding | null = null;
let runtimeInitPromise: Promise<void> | null = null;
let db: any;
let runtimeMode: "d1" | "libsql" = "libsql";
let runtimeSnapshotCache:
  | {
      computedAt: number;
      signature: string;
      summary: AnalysisSummary;
      items: AnalysisItem[];
    }
  | null = null;
const RUNTIME_SNAPSHOT_TTL_MS = 15_000;

export function configureDatabase(options: { d1?: D1Binding | null; databaseUrl?: string } = {}) {
  let shouldReinitialize = false;

  if (options.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl;
    shouldReinitialize = true;
  }

  const shouldReconfigure = options.d1 !== undefined && options.d1 !== configuredD1;
  if (shouldReconfigure) {
    configuredD1 = options.d1 ?? null;
    shouldReinitialize = true;
  }

  if (shouldReinitialize) {
    runtimeInitPromise = null;
    runtimeSnapshotCache = null;
  }
}

async function ensureRuntimeReady() {
  if (runtimeInitPromise) {
    await runtimeInitPromise;
    return;
  }

  runtimeInitPromise = (async () => {
    if (configuredD1) {
      runtimeMode = "d1";
      db = drizzleD1(configuredD1, { schema });
    } else {
      runtimeMode = "libsql";
      const libsqlClient: LibsqlClient = createClient({ url: resolveSqlitePath() });
      db = drizzleLibsql(libsqlClient, { schema });
    }

    if (!configuredD1) {
      await ensureDatabase();
      await cleanupOrphanRows();
      await seedDemoDataIfEmpty();
      await refreshAnalysisSnapshot();
    }
  })();

  try {
    await runtimeInitPromise;
  } catch (error) {
    runtimeInitPromise = null;
    throw error;
  }
}

function resolveSqlitePath() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return `file:${DEFAULT_DB_PATH}`;
  if (raw.startsWith("file:")) return raw;
  if (raw.endsWith(".db") || raw.endsWith(".sqlite")) return `file:${raw}`;
  return `file:${DEFAULT_DB_PATH}`;
}

function nowIso() {
  return new Date().toISOString();
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanText(value: unknown, maxLength = 160) {
  if (value == null) return "";
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength);
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(value).replace(/,/g, ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  return Number(match[0]);
}

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "", "id");
}

function buildDateRange(start: string, end: string) {
  const result = new Set<string>();
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = new Date(`${end}T00:00:00Z`);
  while (cursor <= final) {
    result.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function isDemoBatch(batch: Pick<UploadBatch, "filename">) {
  return batch.filename.startsWith("demo-");
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashFnv32(input: string, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createDeterministicId(prefix: string, ...parts: string[]) {
  const key = parts.join("|");
  const hashA = hashFnv32(key, 0x811c9dc5);
  const hashB = hashFnv32(key, 0x9e3779b1);
  return `${prefix}_${hashA}${hashB}`;
}

async function insertBatchWithFallback<T>(table: any, rows: T[], options?: { ignoreConflicts?: boolean }) {
  if (rows.length === 0) return;
  try {
    const query = db.insert(table).values(rows);
    if (options?.ignoreConflicts) {
      await query.onConflictDoNothing().run();
    } else {
      await query.run();
    }
    return;
  } catch (error) {
    if (rows.length === 1) throw error;
  }

  const middle = Math.ceil(rows.length / 2);
  await insertBatchWithFallback(table, rows.slice(0, middle), options);
  await insertBatchWithFallback(table, rows.slice(middle), options);
}

async function insertInChunks<T>(
  table: any,
  rows: T[],
  maxRowsPerChunk = 40,
  maxApproxBytesPerChunk = 20_000,
  options?: { ignoreConflicts?: boolean },
) {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentChunkBytes = 0;
  for (const row of rows) {
    const rowBytes = JSON.stringify(row).length;
    const shouldFlush =
      currentChunk.length > 0 &&
      (currentChunk.length >= maxRowsPerChunk || currentChunkBytes + rowBytes > maxApproxBytesPerChunk);

    if (shouldFlush) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkBytes = 0;
    }

    currentChunk.push(row);
    currentChunkBytes += rowBytes;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  if (chunks.length === 0) return;

  const concurrency = runtimeMode === "d1" ? 2 : 1;
  for (let index = 0; index < chunks.length; index += concurrency) {
    const group = chunks.slice(index, index + concurrency);
    await Promise.all(group.map((chunk) => insertBatchWithFallback(table, chunk, options)));
  }
}

function toJson(value: unknown) {
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const MASTER_PRESET = {
  "product name": "item_name",
  category: "category",
  brand: "brand",
  description: "description",
  variant: "variant",
  "product code sku": "item_code",
  "product code barcode": "item_code",
  "product code": "item_code",
  sku: "item_code",
  "selling price": "selling_price",
  "base price": "base_price",
  stock: "current_stock",
  "minimum stock": "minimum_stock",
} as const;

const SALES_SUMMARY_PRESET = {
  "product name": "item_name",
  category: "category",
  "product code sku": "item_code",
  "number of products sold unit": "qty_sold",
  "gross sales": "gross_sales",
  "service fee": "service_fee",
  taxes: "taxes",
  sales: "net_sales",
} as const;

const SALES_TRANSACTION_PRESET = {
  "sale date": "sale_date",
  date: "sale_date",
  "transaction id": "transaction_id",
  "product name": "item_name",
  category: "category",
  brand: "brand",
  "product code sku": "item_code",
  "product code barcode": "item_code",
  qty: "qty_sold",
  "qty sold": "qty_sold",
  "number of products sold unit": "qty_sold",
  "gross sales": "gross_sales",
  sales: "net_sales",
} as const;

function detectSalesDatasetType(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  return normalized.some((header) => header.includes("sale date") || header === "date")
    ? "sales_transaction"
    : "sales_summary";
}

function suggestMapping(mode: DatasetType, headers: string[]) {
  const normalizedHeaders = Object.fromEntries(headers.map((header) => [normalizeHeader(header), header]));
  const preset =
    mode === "master"
      ? MASTER_PRESET
      : mode === "sales_transaction"
        ? SALES_TRANSACTION_PRESET
        : SALES_SUMMARY_PRESET;

  const mapping: UploadMapping = {};
  for (const [normalizedHeader, field] of Object.entries(preset)) {
    const match = normalizedHeaders[normalizedHeader];
    if (match) mapping[field] = match;
  }
  return mapping;
}

function detectPeriod(metadataLines: string[] = []) {
  const haystack = metadataLines.join(" ");
  const match = haystack.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  if (!match) return { periodStart: null, periodEnd: null };
  return { periodStart: match[1], periodEnd: match[2] };
}

function requiredFieldsFor(mode: DatasetType) {
  if (mode === "master") return ["item_code", "item_name", "current_stock"];
  if (mode === "sales_transaction") return ["sale_date", "item_code", "qty_sold"];
  return ["item_code", "qty_sold"];
}

function getMissingMasterFields(mapping: UploadMapping) {
  return requiredFieldsFor("master").filter((field) => !mapping[field]);
}

function getMissingSalesSummaryFields(mapping: UploadMapping) {
  return requiredFieldsFor("sales_summary").filter((field) => !mapping[field]);
}

function mapMasterRows(
  sourceRows: Array<Record<string, unknown>>,
  mapping: UploadMapping,
  batchId: string,
) {
  const rowMap = new Map<string, Omit<(typeof inventoryItems)["$inferInsert"], "id">>();

  for (const sourceRow of sourceRows) {
    const itemCode = cleanText(resolveValue(sourceRow, mapping, "item_code"));
    const itemName = cleanText(resolveValue(sourceRow, mapping, "item_name"));
    if (!itemCode || !itemName) continue;

    rowMap.set(itemCode, {
      batchId,
      itemCode,
      itemName,
      category: cleanText(resolveValue(sourceRow, mapping, "category")) || null,
      brand: cleanText(resolveValue(sourceRow, mapping, "brand")) || null,
      description: cleanText(resolveValue(sourceRow, mapping, "description")) || null,
      variant: cleanText(resolveValue(sourceRow, mapping, "variant")) || null,
      sellingPrice: parseNumber(resolveValue(sourceRow, mapping, "selling_price")) || null,
      basePrice: parseNumber(resolveValue(sourceRow, mapping, "base_price")) || null,
      currentStock: parseNumber(resolveValue(sourceRow, mapping, "current_stock")),
      minimumStock: parseNumber(resolveValue(sourceRow, mapping, "minimum_stock")) || null,
    });
  }

  return Array.from(rowMap.values()).map((row) => ({
    id: createDeterministicId("inventory", batchId, row.itemCode),
    ...row,
  }));
}

function mapSalesSummaryRows(
  sourceRows: Array<Record<string, unknown>>,
  mapping: UploadMapping,
  input: { batchId: string; periodStart: string; periodEnd: string },
) {
  type SummaryRow = {
    batchId: string;
    periodStart: string;
    periodEnd: string;
    itemCode: string;
    itemName: string;
    category: string | null;
    qtySold: number;
    grossSales: number | null;
    serviceFee: number | null;
    taxes: number | null;
    netSales: number | null;
  };
  const rowMap = new Map<string, SummaryRow>();

  for (const sourceRow of sourceRows) {
    const itemCode = cleanText(resolveValue(sourceRow, mapping, "item_code"));
    if (!itemCode) continue;

    const qtySold = parseNumber(resolveValue(sourceRow, mapping, "qty_sold"));
    const grossSales = parseNumber(resolveValue(sourceRow, mapping, "gross_sales")) || 0;
    const serviceFee = parseNumber(resolveValue(sourceRow, mapping, "service_fee")) || 0;
    const taxes = parseNumber(resolveValue(sourceRow, mapping, "taxes")) || 0;
    const netSales = parseNumber(resolveValue(sourceRow, mapping, "net_sales")) || 0;

    const existing = rowMap.get(itemCode);
    if (!existing) {
      rowMap.set(itemCode, {
        batchId: input.batchId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        itemCode,
        itemName:
          cleanText(resolveValue(sourceRow, mapping, "item_name")) ||
          itemCode,
        category: cleanText(resolveValue(sourceRow, mapping, "category")) || null,
        qtySold,
        grossSales: grossSales || null,
        serviceFee: serviceFee || null,
        taxes: taxes || null,
        netSales: netSales || null,
      });
      continue;
    }

    existing.qtySold += qtySold;
    existing.grossSales = (existing.grossSales ?? 0) + grossSales || null;
    existing.serviceFee = (existing.serviceFee ?? 0) + serviceFee || null;
    existing.taxes = (existing.taxes ?? 0) + taxes || null;
    existing.netSales = (existing.netSales ?? 0) + netSales || null;
  }

  return Array.from(rowMap.values()).map((row) => ({
    id: createDeterministicId("sales_summary_row", input.batchId, row.itemCode),
    ...row,
  }));
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function previewParsedFile(payload: PreviewPayload) {
  const detectedDatasetType =
    payload.datasetType === "master" ? "master" : detectSalesDatasetType(payload.headers);
  const suggestedMapping = suggestMapping(detectedDatasetType, payload.headers);
  const { periodStart, periodEnd } = detectPeriod(payload.metadataLines);
  const requiredFields = requiredFieldsFor(detectedDatasetType);
  const missingRequiredFields = requiredFields.filter((field) => !suggestedMapping[field]);
  const previewRows = payload.rows.slice(0, 8);

  return {
    detectedDatasetType,
    suggestedMapping,
    requiredFields,
    missingRequiredFields,
    inferredPeriodStart: periodStart,
    inferredPeriodEnd: periodEnd,
    rowCount: payload.totalRows ?? payload.rows.length,
    previewRows,
  };
}

function resolveValue(row: Record<string, unknown>, mapping: UploadMapping, field: string) {
  const sourceHeader = mapping[field];
  if (!sourceHeader) return null;
  return row[sourceHeader] ?? null;
}

async function maybeDeactivateDemoBatches(mode: UploadMode) {
  const batchTypeFilter =
    mode === "master"
      ? eq(uploadBatches.datasetType, "master")
      : inArray(uploadBatches.datasetType, ["sales_summary", "sales_transaction"]);
  const activeBatches = await db
    .select()
    .from(uploadBatches)
    .where(and(batchTypeFilter, eq(uploadBatches.isActive, true)))
    .all();

  if (activeBatches.length === 0 || activeBatches.some((batch: UploadBatch) => !isDemoBatch(batch))) {
    return;
  }

  await db
    .update(uploadBatches)
    .set({ isActive: false })
    .where(and(batchTypeFilter, eq(uploadBatches.isActive, true)))
    .run();
}

async function purgeBatchData(batchId: string) {
  await db.delete(inventoryItems).where(eq(inventoryItems.batchId, batchId)).run();
  await db.delete(salesSummaryRecords).where(eq(salesSummaryRecords.batchId, batchId)).run();
  await db.delete(salesTransactionRecords).where(eq(salesTransactionRecords.batchId, batchId)).run();
  await db.delete(uploadBatches).where(eq(uploadBatches.id, batchId)).run();
}

async function cleanupProcessingBatches(datasetTypes: DatasetType[]) {
  const processingBatches = await db
    .select({ id: uploadBatches.id })
    .from(uploadBatches)
    .where(and(inArray(uploadBatches.datasetType, datasetTypes), eq(uploadBatches.status, "processing")))
    .all();

  for (const batch of processingBatches as Array<{ id: string }>) {
    await purgeBatchData(batch.id);
  }
}

export async function commitMasterUpload(payload: CommitPayload) {
  await ensureRuntimeReady();
  const preview = previewParsedFile(payload);
  if (preview.detectedDatasetType !== "master") {
    throw new Error("File master harus diupload sebagai dataset master.");
  }

  const effectiveMapping: UploadMapping = {
    ...preview.suggestedMapping,
    ...payload.mapping,
  };

  const missing = getMissingMasterFields(effectiveMapping);
  if (missing.length > 0) {
    throw new Error(`Mapping master belum lengkap: ${missing.join(", ")}`);
  }

  let createdBatchId: string | null = null;
  try {
    const started = await startMasterUpload({
      fileName: payload.fileName,
      rowCount: payload.rows.length,
      mapping: effectiveMapping,
    });
    createdBatchId = started.batchId;

    const chunkedRows = chunkArray(payload.rows, 100);
    for (const rows of chunkedRows) {
      await appendMasterUploadChunk({
        batchId: started.batchId,
        rows,
        mapping: effectiveMapping,
      });
    }

    return finalizeMasterUpload({ batchId: started.batchId });
  } catch (error) {
    if (createdBatchId) {
      await purgeBatchData(createdBatchId).catch(() => {});
    }
    throw error;
  }
}

export async function startMasterUpload(payload: StartMasterUploadPayload) {
  await ensureRuntimeReady();
  const missing = getMissingMasterFields(payload.mapping);
  if (missing.length > 0) {
    throw new Error(`Mapping master belum lengkap: ${missing.join(", ")}`);
  }

  await maybeDeactivateDemoBatches("master");
  await cleanupProcessingBatches(["master"]);

  const batchId = createId("master");
  const validationSummary = { requiredFields: requiredFieldsFor("master"), missingFields: [] };

  await db
    .insert(uploadBatches)
    .values({
      id: batchId,
      datasetType: "master",
      filename: payload.fileName,
      isActive: false,
      rowCount: payload.rowCount,
      mappingJson: toJson(payload.mapping),
      validationSummaryJson: toJson(validationSummary),
      status: "processing",
      uploadedAt: nowIso(),
    })
    .run();

  return { batchId };
}

export async function appendMasterUploadChunk(payload: AppendMasterUploadChunkPayload) {
  await ensureRuntimeReady();
  const missing = getMissingMasterFields(payload.mapping);
  if (missing.length > 0) {
    throw new Error(`Mapping master belum lengkap: ${missing.join(", ")}`);
  }

  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, payload.batchId)).get();
  if (!batch || batch.datasetType !== "master") {
    throw new Error("Batch master tidak ditemukan.");
  }

  const rows = mapMasterRows(payload.rows, payload.mapping, payload.batchId);
  if (rows.length === 0) {
    return { batchId: payload.batchId, importedRows: 0 };
  }

  await insertInChunks(inventoryItems, rows, 75, 60_000, { ignoreConflicts: true });

  return { batchId: payload.batchId, importedRows: rows.length };
}

export async function finalizeMasterUpload(input: { batchId: string }) {
  await ensureRuntimeReady();
  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, input.batchId)).get();
  if (!batch || batch.datasetType !== "master") {
    throw new Error("Batch master tidak ditemukan.");
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.batchId, input.batchId))
    .get();
  const importedRows = countResult?.count ?? 0;

  await db
    .update(uploadBatches)
    .set({
      isActive: true,
      status: "ready",
      rowCount: importedRows,
    })
    .where(and(eq(uploadBatches.id, input.batchId), eq(uploadBatches.datasetType, "master")))
    .run();
  await db
    .update(uploadBatches)
    .set({ isActive: false })
    .where(and(eq(uploadBatches.datasetType, "master"), sql`${uploadBatches.id} <> ${input.batchId}`))
    .run();

  await refreshAnalysisSnapshot();

  return { batchId: input.batchId, importedRows };
}

export async function commitSalesSummaryUpload(payload: CommitPayload) {
  await ensureRuntimeReady();
  const preview = previewParsedFile(payload);
  const periodStart = payload.periodStart ?? preview.inferredPeriodStart;
  const periodEnd = payload.periodEnd ?? preview.inferredPeriodEnd;

  if (!periodStart || !periodEnd) {
    throw new Error("Period start dan period end wajib diisi untuk sales summary.");
  }

  const missing = getMissingSalesSummaryFields(payload.mapping);
  if (missing.length > 0) {
    throw new Error(`Mapping sales summary belum lengkap: ${missing.join(", ")}`);
  }

  const started = await startSalesSummaryUpload({
    fileName: payload.fileName,
    rowCount: payload.rows.length,
    mapping: payload.mapping,
    periodStart,
    periodEnd,
  });

  const chunkedRows = chunkArray(payload.rows, 50);
  for (const rows of chunkedRows) {
    await appendSalesSummaryChunk({
      batchId: started.batchId,
      rows,
      mapping: payload.mapping,
    });
  }

  return finalizeSalesSummaryUpload({ batchId: started.batchId });
}

export async function startSalesSummaryUpload(payload: StartSalesSummaryUploadPayload) {
  await ensureRuntimeReady();
  const missing = getMissingSalesSummaryFields(payload.mapping);
  if (missing.length > 0) {
    throw new Error(`Mapping sales summary belum lengkap: ${missing.join(", ")}`);
  }

  await maybeDeactivateDemoBatches("sales");
  await cleanupProcessingBatches(["sales_summary"]);

  const batchId = createId("sales_summary");
  await db
    .insert(uploadBatches)
    .values({
      id: batchId,
      datasetType: "sales_summary",
      filename: payload.fileName,
      isActive: true,
      rowCount: payload.rowCount,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      mappingJson: toJson(payload.mapping),
      validationSummaryJson: toJson({ requiredFields: requiredFieldsFor("sales_summary"), missingFields: [] }),
      status: "processing",
      uploadedAt: nowIso(),
    })
    .run();

  return { batchId };
}

export async function appendSalesSummaryChunk(payload: AppendSalesSummaryChunkPayload) {
  await ensureRuntimeReady();
  const missing = getMissingSalesSummaryFields(payload.mapping);
  if (missing.length > 0) {
    throw new Error(`Mapping sales summary belum lengkap: ${missing.join(", ")}`);
  }

  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, payload.batchId)).get();
  if (!batch || batch.datasetType !== "sales_summary" || !batch.periodStart || !batch.periodEnd) {
    throw new Error("Batch sales summary tidak ditemukan.");
  }

  const rows = mapSalesSummaryRows(payload.rows, payload.mapping, {
    batchId: payload.batchId,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
  });

  if (rows.length > 0) {
    await insertInChunks(salesSummaryRecords, rows, 75, 60_000, { ignoreConflicts: true });
  }

  return { batchId: payload.batchId, importedRows: rows.length };
}

export async function finalizeSalesSummaryUpload(input: { batchId: string }) {
  await ensureRuntimeReady();
  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, input.batchId)).get();
  if (!batch || batch.datasetType !== "sales_summary") {
    throw new Error("Batch sales summary tidak ditemukan.");
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(salesSummaryRecords)
    .where(eq(salesSummaryRecords.batchId, input.batchId))
    .get();
  const importedRows = countResult?.count ?? 0;

  await db
    .update(uploadBatches)
    .set({
      status: "ready",
      rowCount: importedRows,
      isActive: true,
    })
    .where(and(eq(uploadBatches.id, input.batchId), eq(uploadBatches.datasetType, "sales_summary")))
    .run();

  await refreshAnalysisSnapshot();

  return {
    batchId: input.batchId,
    importedRows,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
  };
}

export async function commitSalesTransactionUpload(payload: CommitPayload) {
  await ensureRuntimeReady();
  const missing = requiredFieldsFor("sales_transaction").filter((field) => !payload.mapping[field]);
  if (missing.length > 0) {
    throw new Error(`Mapping sales transaction belum lengkap: ${missing.join(", ")}`);
  }

  await maybeDeactivateDemoBatches("sales");

  const parsedDates = payload.rows
    .map((row) => parseDate(resolveValue(row, payload.mapping, "sale_date")))
    .filter((value): value is string => Boolean(value));

  const periodStart = parsedDates.length ? parsedDates.slice().sort()[0] : null;
  const periodEnd = parsedDates.length ? parsedDates.slice().sort().at(-1) ?? null : null;

  const batchId = createId("sales_transaction");
  await db
    .insert(uploadBatches)
    .values({
      id: batchId,
      datasetType: "sales_transaction",
      filename: payload.fileName,
      isActive: true,
      rowCount: payload.rows.length,
      periodStart,
      periodEnd,
      mappingJson: toJson(payload.mapping),
      validationSummaryJson: toJson({ requiredFields: requiredFieldsFor("sales_transaction"), missingFields: [] }),
      status: "ready",
      uploadedAt: nowIso(),
    })
    .run();

  const rows = payload.rows
    .map((row) => ({
      id: createId("sales_transaction_row"),
      batchId,
      saleDate: parseDate(resolveValue(row, payload.mapping, "sale_date")) ?? nowIso().slice(0, 10),
      transactionId: cleanText(resolveValue(row, payload.mapping, "transaction_id")) || null,
      itemCode: cleanText(resolveValue(row, payload.mapping, "item_code")),
      itemName: cleanText(resolveValue(row, payload.mapping, "item_name")) || cleanText(resolveValue(row, payload.mapping, "item_code")),
      category: cleanText(resolveValue(row, payload.mapping, "category")) || null,
      brand: cleanText(resolveValue(row, payload.mapping, "brand")) || null,
      qtySold: parseNumber(resolveValue(row, payload.mapping, "qty_sold")),
      grossSales: parseNumber(resolveValue(row, payload.mapping, "gross_sales")) || null,
      netSales: parseNumber(resolveValue(row, payload.mapping, "net_sales")) || null,
    }))
    .filter((row) => row.itemCode);

  if (rows.length > 0) {
    await insertInChunks(salesTransactionRecords, rows, 40, 20_000);
  }

  await refreshAnalysisSnapshot();

  return { batchId, importedRows: rows.length, periodStart, periodEnd };
}

export async function listUploadHistory() {
  await ensureRuntimeReady();
  return db
    .select({
      id: uploadBatches.id,
      datasetType: uploadBatches.datasetType,
      filename: uploadBatches.filename,
      status: uploadBatches.status,
      isActive: uploadBatches.isActive,
      uploadedAt: uploadBatches.uploadedAt,
      rowCount: uploadBatches.rowCount,
      periodStart: uploadBatches.periodStart,
      periodEnd: uploadBatches.periodEnd,
    })
    .from(uploadBatches)
    .orderBy(desc(uploadBatches.uploadedAt))
    .all();
}

export async function setActiveBatches(input: { masterBatchId?: string | null; salesBatchIds: string[] }) {
  await ensureRuntimeReady();
  await db.update(uploadBatches).set({ isActive: false }).where(eq(uploadBatches.datasetType, "master")).run();
  await db
    .update(uploadBatches)
    .set({ isActive: false })
    .where(inArray(uploadBatches.datasetType, ["sales_summary", "sales_transaction"]))
    .run();

  if (input.masterBatchId) {
    await db
      .update(uploadBatches)
      .set({ isActive: true })
      .where(and(eq(uploadBatches.id, input.masterBatchId), eq(uploadBatches.datasetType, "master")))
      .run();
  }

  if (input.salesBatchIds.length > 0) {
    await db
      .update(uploadBatches)
      .set({ isActive: true })
      .where(inArray(uploadBatches.id, input.salesBatchIds))
      .run();
  }

  await refreshAnalysisSnapshot();

  return { success: true };
}

export async function getBatchDetail(batchId: string) {
  await ensureRuntimeReady();
  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, batchId)).get();
  if (!batch) throw new Error("Batch tidak ditemukan.");

  if (batch.datasetType === "master") {
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.batchId, batchId))
      .orderBy(asc(inventoryItems.itemName))
      .limit(25)
      .all();
    return { batch, rows };
  }

  if (batch.datasetType === "sales_summary") {
    const rows = await db
      .select()
      .from(salesSummaryRecords)
      .where(eq(salesSummaryRecords.batchId, batchId))
      .orderBy(desc(salesSummaryRecords.qtySold))
      .limit(25)
      .all();
    return { batch, rows };
  }

  const rows = await db
    .select()
    .from(salesTransactionRecords)
    .where(eq(salesTransactionRecords.batchId, batchId))
    .orderBy(desc(salesTransactionRecords.saleDate))
    .limit(25)
    .all();

  return { batch, rows };
}

export async function deleteBatch(batchId: string) {
  await ensureRuntimeReady();
  const batch = await db.select().from(uploadBatches).where(eq(uploadBatches.id, batchId)).get();
  if (!batch) {
    throw new Error("Batch tidak ditemukan.");
  }

  await purgeBatchData(batchId);
  await refreshAnalysisSnapshot();

  return { success: true, deletedBatchId: batchId };
}

async function readSummaryRow(): Promise<AnalysisSummary | undefined> {
  return db.select().from(analysisSummary).get();
}

async function readAnalysisItems(): Promise<AnalysisItem[]> {
  return db.select().from(analysisItems).all();
}

async function getCurrentAnalysisState() {
  const now = Date.now();
  if (runtimeSnapshotCache && now - runtimeSnapshotCache.computedAt <= RUNTIME_SNAPSHOT_TTL_MS) {
    return {
      summary: runtimeSnapshotCache.summary,
      items: runtimeSnapshotCache.items,
    };
  }

  const summary = await readSummaryRow();
  const items = await readAnalysisItems();

  if (summary) {
    runtimeSnapshotCache = {
      computedAt: now,
      signature: `${summary.refreshedAt}:${summary.totalItems}:${summary.coverageStart ?? ""}:${summary.coverageEnd ?? ""}`,
      summary,
      items,
    };
  }

  return { summary, items };
}

function buildFilteredItems(filters: ListFilters, items: AnalysisItem[]) {
  const search = filters.search?.trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (search) {
      const haystack = `${item.itemCode} ${item.itemName} ${item.category ?? ""} ${item.brand ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.brand && item.brand !== filters.brand) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.stockStatus && item.stockStatus !== filters.stockStatus) return false;
    if (filters.purchasePriority && item.purchasePriority !== filters.purchasePriority) return false;
    if (filters.movementClass && item.movementClass !== filters.movementClass) return false;
    return true;
  });

  const sortBy = filters.sortBy ?? "priorityScore";
  const sortDirection = filters.sortDirection ?? "desc";

  filtered.sort((left, right) => {
    const dir = sortDirection === "asc" ? 1 : -1;
    if (sortBy === "itemName") return compareText(left.itemName, right.itemName) * dir;
    if (sortBy === "currentStock") return (left.currentStock - right.currentStock) * dir;
    if (sortBy === "qtyTotal") return (left.qtyTotal - right.qtyTotal) * dir;
    if (sortBy === "salesValueTotal") return (left.salesValueTotal - right.salesValueTotal) * dir;
    if (sortBy === "coverageDays") return ((left.coverageDays ?? Number.MAX_SAFE_INTEGER) - (right.coverageDays ?? Number.MAX_SAFE_INTEGER)) * dir;
    return (left.priorityScore - right.priorityScore) * dir;
  });

  const pageSize = filters.pageSize ?? 20;
  const page = filters.page ?? 1;
  const offset = (page - 1) * pageSize;

  return {
    items: filtered.slice(offset, offset + pageSize).map((item) => ({
      ...item,
      reasons: parseJson<string[]>(item.reasonJson, []),
    })),
    total: filtered.length,
    page,
    pageSize,
    availableFilters: {
      brands: Array.from(new Set(items.map((item) => item.brand).filter(Boolean))).sort(),
      categories: Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(),
    },
  };
}

export async function getDashboardSummary() {
  await ensureRuntimeReady();
  const { summary, items } = await getCurrentAnalysisState();
  const urgentItems = items
    .filter((item) => item.purchasePriority === "High")
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 5)
    .map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      stockStatus: item.stockStatus,
      purchasePriority: item.purchasePriority,
      movementClass: item.movementClass,
      recommendedOrderQty: item.recommendedOrderQty,
      reasons: parseJson<string[]>(item.reasonJson, []),
    }));

  return { summary, urgentItems };
}

export async function getDashboardCharts() {
  await ensureRuntimeReady();
  const { items } = await getCurrentAnalysisState();
  const activeBatches = await db
    .select()
    .from(uploadBatches)
    .where(eq(uploadBatches.isActive, true))
    .all();

  const topSelling = items
    .slice()
    .sort((left, right) => right.qtyTotal - left.qtyTotal)
    .slice(0, 10)
    .map((item) => ({ label: item.itemName, value: round(item.qtyTotal) }));

  const stockDistribution = [
    { label: "Kosong", value: items.filter((item) => item.stockStatus === "Kosong").length },
    { label: "Rendah", value: items.filter((item) => item.stockStatus === "Rendah").length },
    { label: "Aman", value: items.filter((item) => item.stockStatus === "Aman").length },
  ];

  const movementDistribution = [
    { label: "Fast", value: items.filter((item) => item.movementClass === "Fast Moving").length },
    { label: "Medium", value: items.filter((item) => item.movementClass === "Medium Moving").length },
    { label: "Slow", value: items.filter((item) => item.movementClass === "Slow Moving").length },
    { label: "Dead", value: items.filter((item) => item.movementClass === "Dead Moving").length },
  ];

  const summaryBatches = activeBatches.filter((batch: UploadBatch) => batch.datasetType === "sales_summary");
  const transactionBatches = activeBatches.filter(
    (batch: UploadBatch) => batch.datasetType === "sales_transaction",
  );

  const trendMap = new Map<string, TrendPoint>();

  const summaryBatchIds = summaryBatches.map((batch: UploadBatch) => batch.id);
  const summaryTotals =
    summaryBatchIds.length > 0
      ? await db
          .select({
            batchId: salesSummaryRecords.batchId,
            qty: sql<number>`coalesce(sum(${salesSummaryRecords.qtySold}), 0)`,
            sales: sql<number>`coalesce(sum(coalesce(${salesSummaryRecords.netSales}, ${salesSummaryRecords.grossSales})), 0)`,
          })
          .from(salesSummaryRecords)
          .where(inArray(salesSummaryRecords.batchId, summaryBatchIds))
          .groupBy(salesSummaryRecords.batchId)
          .all()
      : [];
  const summaryTotalsByBatch = new Map<string, { qty: number; sales: number }>(
    (summaryTotals as Array<{ batchId: string; qty: number; sales: number }>).map((row) => [
      row.batchId,
      { qty: row.qty, sales: row.sales },
    ]),
  );

  for (const batch of summaryBatches) {
    const label = batch.periodStart && batch.periodEnd ? `${batch.periodStart} → ${batch.periodEnd}` : batch.filename;
    const rowTotals = summaryTotalsByBatch.get(batch.id);

    trendMap.set(label, {
      label,
      qty: round(rowTotals?.qty ?? 0),
      sales: round(rowTotals?.sales ?? 0),
    });
  }

  if (transactionBatches.length > 0) {
    const transactionBatchIds = transactionBatches.map((batch: UploadBatch) => batch.id);
    const monthExpr = sql<string>`substr(${salesTransactionRecords.saleDate}, 1, 7)`;
    const rows = await db
      .select({
        label: monthExpr,
        qty: sql<number>`coalesce(sum(${salesTransactionRecords.qtySold}), 0)`,
        sales: sql<number>`coalesce(sum(coalesce(${salesTransactionRecords.netSales}, ${salesTransactionRecords.grossSales})), 0)`,
      })
      .from(salesTransactionRecords)
      .where(inArray(salesTransactionRecords.batchId, transactionBatchIds))
      .groupBy(monthExpr)
      .all();

    for (const row of rows as Array<{ label: string; qty: number; sales: number }>) {
      trendMap.set(row.label, { label: row.label, qty: round(row.qty), sales: round(row.sales) });
    }
  }

  const trend = Array.from(trendMap.values()).sort((left, right) => compareText(left.label, right.label));

  const fallbackBreakdown = items
    .slice()
    .sort((left, right) => right.salesValueTotal - left.salesValueTotal)
    .slice(0, 6)
    .map((item) => ({
      label: item.category ?? item.itemName,
      value: round(item.salesValueTotal),
    }));

  return {
    topSelling,
    stockDistribution,
    movementDistribution,
    trend,
    fallbackBreakdown,
  };
}

export async function listInventory(filters: ListFilters) {
  await ensureRuntimeReady();
  const { items } = await getCurrentAnalysisState();
  return buildFilteredItems(filters, items);
}

export async function listPurchaseRecommendations(filters: ListFilters) {
  await ensureRuntimeReady();
  const { items: currentItems } = await getCurrentAnalysisState();
  const items = currentItems.filter(
    (item) => item.purchasePriority !== "Low" || item.qtyTotal > 0,
  );
  return buildFilteredItems({ ...filters, sortBy: filters.sortBy ?? "priorityScore" }, items);
}

export async function listSlowMoving(filters: ListFilters) {
  await ensureRuntimeReady();
  const { items } = await getCurrentAnalysisState();
  return buildFilteredItems(
    { ...filters, sortBy: filters.sortBy ?? "coverageDays" },
    items.filter(
      (item) =>
        item.movementClass === "Slow Moving" ||
        item.movementClass === "Dead Moving" ||
        (item.currentStock > 10 && item.qtyTotal < 3),
    ),
  );
}

export async function getItemDetail(itemCode: string) {
  await ensureRuntimeReady();
  const { items } = await getCurrentAnalysisState();
  const item = items.find((current) => current.itemCode === itemCode);
  if (!item) throw new Error("Barang tidak ditemukan.");

  const summaryRows = (await db
    .select()
    .from(salesSummaryRecords)
    .where(eq(salesSummaryRecords.itemCode, itemCode))
    .all())
    .map((row: any) => ({
      label: `${row.periodStart} → ${row.periodEnd}`,
      qty: round(row.qtySold),
      sales: round(row.netSales ?? row.grossSales ?? 0),
      type: "summary" as const,
    }));

  const transactionRows = (await db
    .select()
    .from(salesTransactionRecords)
    .where(eq(salesTransactionRecords.itemCode, itemCode))
    .orderBy(asc(salesTransactionRecords.saleDate))
    .all())
    .map((row: any) => ({
      label: row.saleDate,
      qty: round(row.qtySold),
      sales: round(row.netSales ?? row.grossSales ?? 0),
      type: "transaction" as const,
      transactionId: row.transactionId,
    }));

  return {
    item: {
      ...item,
      reasons: parseJson<string[]>(item.reasonJson, []),
    },
    summaryHistory: summaryRows,
    transactionHistory: transactionRows,
  };
}

export async function getReportsPayload() {
  await ensureRuntimeReady();
  const dashboard = await getDashboardSummary();
  const charts = await getDashboardCharts();
  const purchase = await listPurchaseRecommendations({
    pageSize: 100,
    sortBy: "priorityScore",
    sortDirection: "desc",
  });
  const slowMoving = await listSlowMoving({
    pageSize: 100,
    sortBy: "coverageDays",
    sortDirection: "desc",
  });

  return {
    summary: dashboard.summary,
    charts,
    purchase: purchase.items,
    slowMoving: slowMoving.items,
  };
}

function toSqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function refreshAnalysisSnapshotD1() {
  const activeMaster = await db
    .select({ id: uploadBatches.id })
    .from(uploadBatches)
    .where(and(eq(uploadBatches.datasetType, "master"), eq(uploadBatches.isActive, true)))
    .orderBy(desc(uploadBatches.uploadedAt))
    .get();

  const activeSalesBatches = await db
    .select({
      id: uploadBatches.id,
      datasetType: uploadBatches.datasetType,
      periodStart: uploadBatches.periodStart,
      periodEnd: uploadBatches.periodEnd,
    })
    .from(uploadBatches)
    .where(and(inArray(uploadBatches.datasetType, ["sales_summary", "sales_transaction"]), eq(uploadBatches.isActive, true)))
    .all();

  const summaryBatchIds = activeSalesBatches
    .filter((batch: UploadBatch) => batch.datasetType === "sales_summary")
    .map((batch: UploadBatch) => batch.id);
  const transactionBatchIds = activeSalesBatches
    .filter((batch: UploadBatch) => batch.datasetType === "sales_transaction")
    .map((batch: UploadBatch) => batch.id);

  const coverage = new Set<string>();
  for (const batch of activeSalesBatches) {
    if (batch.datasetType === "sales_summary" && batch.periodStart && batch.periodEnd) {
      for (const date of buildDateRange(batch.periodStart, batch.periodEnd)) {
        coverage.add(date);
      }
    }
  }

  if (transactionBatchIds.length > 0) {
    const range = await db
      .select({
        start: sql<string | null>`min(${salesTransactionRecords.saleDate})`,
        end: sql<string | null>`max(${salesTransactionRecords.saleDate})`,
      })
      .from(salesTransactionRecords)
      .where(inArray(salesTransactionRecords.batchId, transactionBatchIds))
      .get();

    if (range?.start && range?.end) {
      for (const date of buildDateRange(range.start, range.end)) {
        coverage.add(date);
      }
    }
  }

  const coverageList = Array.from(coverage).sort();
  const coverageStart = coverageList[0] ?? null;
  const coverageEnd = coverageList.at(-1) ?? null;
  const coverageDays = coverageList.length;

  const masterBatchSql = activeMaster?.id ? toSqlString(activeMaster.id) : "NULL";
  const summaryInSql = summaryBatchIds.length > 0 ? summaryBatchIds.map(toSqlString).join(", ") : "";
  const txInSql = transactionBatchIds.length > 0 ? transactionBatchIds.map(toSqlString).join(", ") : "";

  const summaryAggSql =
    summaryBatchIds.length > 0
      ? `
        select
          item_code,
          max(item_name) as item_name,
          max(category) as category,
          sum(qty_sold) as qty_total,
          sum(coalesce(net_sales, gross_sales, 0)) as sales_value_total,
          count(distinct period_start || '|' || period_end) as frequency_score
        from sales_summary_records
        where batch_id in (${summaryInSql})
        group by item_code
      `
      : `
        select
          item_code,
          item_name,
          category,
          qty_total,
          sales_value_total,
          frequency_score
        from (
          select
            '' as item_code,
            '' as item_name,
            null as category,
            0 as qty_total,
            0 as sales_value_total,
            0 as frequency_score
        )
        where 1=0
      `;

  const txAggSql =
    transactionBatchIds.length > 0
      ? `
        select
          item_code,
          max(item_name) as item_name,
          max(category) as category,
          sum(qty_sold) as qty_total,
          sum(coalesce(net_sales, gross_sales, 0)) as sales_value_total,
          count(distinct coalesce(transaction_id, sale_date || '-' || item_code || '-' || qty_sold)) as frequency_score
        from sales_transaction_records
        where batch_id in (${txInSql})
        group by item_code
      `
      : `
        select
          item_code,
          item_name,
          category,
          qty_total,
          sales_value_total,
          frequency_score
        from (
          select
            '' as item_code,
            '' as item_name,
            null as category,
            0 as qty_total,
            0 as sales_value_total,
            0 as frequency_score
        )
        where 1=0
      `;

  const activeMasterCodesSql = activeMaster?.id
    ? `select item_code from inventory_items where batch_id = ${masterBatchSql}`
    : `select item_code from sales_agg`;

  await db.delete(analysisItems).run();
  await db.delete(analysisSummary).run();

  const upsertItemsSql = `
    insert into analysis_items (
      id,
      item_code,
      item_name,
      category,
      brand,
      current_stock,
      minimum_stock,
      base_price,
      qty_total,
      sales_value_total,
      period_days,
      period_count,
      frequency_score,
      avg_monthly_sales,
      avg_daily_sales,
      coverage_days,
      stock_status,
      movement_class,
      purchase_priority,
      recommended_order_qty,
      priority_score,
      reason_json,
      dead_stock_flag
    )
    with sales_agg as (
      select
        item_code,
        max(item_name) as item_name,
        max(category) as category,
        sum(qty_total) as qty_total,
        sum(sales_value_total) as sales_value_total,
        sum(frequency_score) as frequency_score
      from (
        ${summaryAggSql}
        union all
        ${txAggSql}
      ) unioned_sales
      group by item_code
    ),
    all_codes as (
      ${activeMasterCodesSql}
      union
      select item_code from sales_agg
    ),
    base as (
      select
        c.item_code as item_code,
        coalesce(i.item_name, s.item_name, c.item_code) as item_name,
        coalesce(i.category, s.category) as category,
        i.brand as brand,
        coalesce(i.current_stock, 0) as current_stock,
        i.minimum_stock as minimum_stock,
        i.base_price as base_price,
        coalesce(s.qty_total, 0) as qty_total,
        coalesce(s.sales_value_total, 0) as sales_value_total,
        coalesce(s.frequency_score, 0) as frequency_score,
        ${coverageDays} as period_days
      from all_codes c
      left join inventory_items i
        on i.batch_id = ${masterBatchSql}
       and i.item_code = c.item_code
      left join sales_agg s
        on s.item_code = c.item_code
    ),
    metrics_1 as (
      select
        *,
        case when period_days > 0 then qty_total * 1.0 / period_days else 0 end as avg_daily_sales,
        case when period_days > 0 then (qty_total * 1.0 / period_days) * 30 else 0 end as avg_monthly_sales,
        case
          when (case when period_days > 0 then qty_total * 1.0 / period_days else 0 end) * 7 > 2
            then cast(((case when period_days > 0 then qty_total * 1.0 / period_days else 0 end) * 7) + 0.9999 as integer)
          else 2
        end as safety_stock
      from base
    ),
    metrics_2 as (
      select
        *,
        max(
          coalesce(minimum_stock, 0),
          cast((avg_daily_sales * 14) + 0.9999 as integer) + safety_stock
        ) as reorder_point,
        cast((avg_daily_sales * 30) + 0.9999 as integer) + safety_stock as target_stock_30d,
        case when avg_daily_sales > 0 then cast(current_stock / avg_daily_sales as integer) else null end as coverage_days
      from metrics_1
    ),
    classified as (
      select
        *,
        case
          when current_stock = 0 then 'Kosong'
          when current_stock <= reorder_point then 'Rendah'
          else 'Aman'
        end as stock_status,
        case
          when qty_total = 0 and current_stock > 0 then 'Dead Moving'
          when qty_total > 0 and ((coverage_days is not null and coverage_days <= 30) or avg_monthly_sales >= 5 or frequency_score >= 4) then 'Fast Moving'
          when qty_total > 0 and ((coverage_days is not null and coverage_days <= 60) or avg_monthly_sales >= 2) then 'Medium Moving'
          else 'Slow Moving'
        end as movement_class
      from metrics_2
    ),
    scored as (
      select
        *,
        case
          when (stock_status = 'Kosong' and qty_total > 0)
            or (stock_status = 'Rendah' and movement_class = 'Fast Moving')
            or (coverage_days is not null and coverage_days <= 14 and qty_total > 0)
            then 'High'
          when (stock_status = 'Rendah' and movement_class = 'Medium Moving')
            or (stock_status = 'Aman' and coverage_days is not null and coverage_days <= 30 and qty_total > 0)
            then 'Medium'
          else 'Low'
        end as purchase_priority,
        max(0, target_stock_30d - current_stock) as recommended_order_qty
      from classified
    )
    select
      'analysis_' || lower(hex(randomblob(8))) as id,
      item_code,
      item_name,
      category,
      brand,
      round(current_stock, 2) as current_stock,
      case when minimum_stock is null then null else round(minimum_stock, 2) end as minimum_stock,
      case when base_price is null then null else round(base_price, 2) end as base_price,
      round(qty_total, 2) as qty_total,
      round(sales_value_total, 2) as sales_value_total,
      period_days,
      cast(frequency_score as integer) as period_count,
      round(frequency_score, 2) as frequency_score,
      round(avg_monthly_sales, 2) as avg_monthly_sales,
      round(avg_daily_sales, 2) as avg_daily_sales,
      coverage_days,
      stock_status,
      movement_class,
      purchase_priority,
      round(recommended_order_qty, 2) as recommended_order_qty,
      (
        (case when stock_status = 'Kosong' then 60 when stock_status = 'Rendah' then 35 else 10 end)
        + min(25, cast((avg_monthly_sales * 3) + 0.9999 as integer))
        + (case when movement_class = 'Fast Moving' then 15 when movement_class = 'Medium Moving' then 8 when movement_class = 'Dead Moving' then -10 else 0 end)
      ) as priority_score,
      case
        when stock_status = 'Kosong' and qty_total > 0 then '["Stok 0, penjualan tinggi pada periode aktif"]'
        when stock_status = 'Rendah' and movement_class = 'Fast Moving' then '["Stok rendah, barang cepat terjual"]'
        when coverage_days is not null and coverage_days <= 14 and qty_total > 0 then '["Estimasi stok habis kurang dari 14 hari"]'
        when purchase_priority = 'Medium' and qty_total > 0 then '["Permintaan stabil, disarankan isi ulang"]'
        when movement_class = 'Dead Moving' then '["Barang tidak bergerak pada periode aktif"]'
        when movement_class = 'Slow Moving' then '["Stok masih tinggi, lambat terjual"]'
        else '[]'
      end as reason_json,
      case when movement_class = 'Dead Moving' then 1 else 0 end as dead_stock_flag
    from scored
  `;
  await db.run(sql.raw(upsertItemsSql));

  const coverageStartSql = coverageStart ? toSqlString(coverageStart) : "NULL";
  const coverageEndSql = coverageEnd ? toSqlString(coverageEnd) : "NULL";

  const summarySql = `
    insert into analysis_summary (
      id,
      refreshed_at,
      total_items,
      total_out_of_stock,
      total_low_stock,
      total_fast_moving,
      total_slow_moving,
      total_dead_moving,
      total_priority_buy,
      estimated_restock_value,
      has_partial_costing,
      coverage_start,
      coverage_end,
      coverage_days,
      stock_distribution_json,
      movement_distribution_json
    )
    select
      'current' as id,
      CURRENT_TIMESTAMP as refreshed_at,
      count(*) as total_items,
      sum(case when stock_status = 'Kosong' then 1 else 0 end) as total_out_of_stock,
      sum(case when stock_status = 'Rendah' then 1 else 0 end) as total_low_stock,
      sum(case when movement_class = 'Fast Moving' then 1 else 0 end) as total_fast_moving,
      sum(case when movement_class = 'Slow Moving' then 1 else 0 end) as total_slow_moving,
      sum(case when movement_class = 'Dead Moving' then 1 else 0 end) as total_dead_moving,
      sum(case when purchase_priority = 'High' then 1 else 0 end) as total_priority_buy,
      round(sum(case when recommended_order_qty > 0 and base_price is not null then recommended_order_qty * base_price else 0 end), 2) as estimated_restock_value,
      case when sum(case when recommended_order_qty > 0 and base_price is null then 1 else 0 end) > 0 then 1 else 0 end as has_partial_costing,
      ${coverageStartSql} as coverage_start,
      ${coverageEndSql} as coverage_end,
      ${coverageDays} as coverage_days,
      json_array(
        json_object('label', 'Kosong', 'value', sum(case when stock_status = 'Kosong' then 1 else 0 end)),
        json_object('label', 'Rendah', 'value', sum(case when stock_status = 'Rendah' then 1 else 0 end)),
        json_object('label', 'Aman', 'value', sum(case when stock_status = 'Aman' then 1 else 0 end))
      ) as stock_distribution_json,
      json_array(
        json_object('label', 'Fast', 'value', sum(case when movement_class = 'Fast Moving' then 1 else 0 end)),
        json_object('label', 'Medium', 'value', sum(case when movement_class = 'Medium Moving' then 1 else 0 end)),
        json_object('label', 'Slow', 'value', sum(case when movement_class = 'Slow Moving' then 1 else 0 end)),
        json_object('label', 'Dead', 'value', sum(case when movement_class = 'Dead Moving' then 1 else 0 end))
      ) as movement_distribution_json
    from analysis_items
  `;
  await db.run(sql.raw(summarySql));
}

async function refreshAnalysisSnapshot() {
  runtimeSnapshotCache = null;
  if (runtimeMode === "d1") {
    await refreshAnalysisSnapshotD1();
    return;
  }

  const computation = await computeAnalysisSnapshot();

  await db.delete(analysisItems).run();
  await db.delete(analysisSummary).run();

  if (computation.items.length > 0) {
    await insertInChunks(
      analysisItems,
      computation.items.map((item) => ({
        id: createId("analysis"),
        itemCode: item.itemCode,
        itemName: item.itemName,
        category: item.category,
        brand: item.brand,
        currentStock: item.currentStock,
        minimumStock: item.minimumStock,
        basePrice: item.basePrice,
        qtyTotal: round(item.qtyTotal),
        salesValueTotal: round(item.salesValueTotal),
        periodDays: item.periodDays,
        periodCount: item.periodCount,
        frequencyScore: round(item.frequencyScore),
        avgMonthlySales: round(item.avgMonthlySales),
        avgDailySales: round(item.avgDailySales),
        coverageDays: item.coverageDays,
        stockStatus: item.stockStatus,
        movementClass: item.movementClass,
        purchasePriority: item.purchasePriority,
        recommendedOrderQty: round(item.recommendedOrderQty),
        priorityScore: round(item.priorityScore),
        reasonJson: toJson(item.reasons),
        deadStockFlag: item.deadStockFlag,
      })),
    );
  }

  await db
    .insert(analysisSummary)
    .values({
      id: "current",
      refreshedAt: nowIso(),
      totalItems: computation.summary.totalItems,
      totalOutOfStock: computation.summary.totalOutOfStock,
      totalLowStock: computation.summary.totalLowStock,
      totalFastMoving: computation.summary.totalFastMoving,
      totalSlowMoving: computation.summary.totalSlowMoving,
      totalDeadMoving: computation.summary.totalDeadMoving,
      totalPriorityBuy: computation.summary.totalPriorityBuy,
      estimatedRestockValue: round(computation.summary.estimatedRestockValue),
      hasPartialCosting: computation.summary.hasPartialCosting,
      coverageStart: computation.summary.coverageStart,
      coverageEnd: computation.summary.coverageEnd,
      coverageDays: computation.summary.coverageDays,
      stockDistributionJson: toJson(computation.summary.stockDistribution),
      movementDistributionJson: toJson(computation.summary.movementDistribution),
    })
    .run();
}

async function computeAnalysisSnapshot(): Promise<AnalysisComputation> {
  const activeMaster = await db
    .select()
    .from(uploadBatches)
    .where(and(eq(uploadBatches.datasetType, "master"), eq(uploadBatches.isActive, true)))
    .orderBy(desc(uploadBatches.uploadedAt))
    .get();

  const masterRows = activeMaster
    ? await db.select().from(inventoryItems).where(eq(inventoryItems.batchId, activeMaster.id)).all()
    : [];

  const activeSalesBatches = await db
    .select()
    .from(uploadBatches)
    .where(and(inArray(uploadBatches.datasetType, ["sales_summary", "sales_transaction"]), eq(uploadBatches.isActive, true)))
    .all();

  const activeSalesSummaryBatches = activeSalesBatches.filter(
    (batch: UploadBatch) => batch.datasetType === "sales_summary",
  );
  const activeTransactionBatches = activeSalesBatches.filter(
    (batch: UploadBatch) => batch.datasetType === "sales_transaction",
  );

  const summaryRows =
    activeSalesSummaryBatches.length > 0
      ? await db
          .select()
          .from(salesSummaryRecords)
          .where(
            inArray(salesSummaryRecords.batchId, activeSalesSummaryBatches.map((batch: UploadBatch) => batch.id)),
          )
          .all()
      : [];

  const transactionRows =
    activeTransactionBatches.length > 0
      ? await db
          .select()
          .from(salesTransactionRecords)
          .where(
            inArray(
              salesTransactionRecords.batchId,
              activeTransactionBatches.map((batch: UploadBatch) => batch.id),
            ),
          )
          .all()
      : [];

  const coverage = new Set<string>();
  for (const batch of activeSalesSummaryBatches) {
    if (batch.periodStart && batch.periodEnd) {
      for (const date of buildDateRange(batch.periodStart, batch.periodEnd)) {
        coverage.add(date);
      }
    }
  }

  if (transactionRows.length > 0) {
    const dates = transactionRows.map((row: any) => row.saleDate).sort();
    const start = dates[0];
    const end = dates.at(-1);
    if (start && end) {
      for (const date of buildDateRange(start, end)) {
        coverage.add(date);
      }
    }
  }

  const coverageList = Array.from(coverage).sort();
  const coverageStart = coverageList[0] ?? null;
  const coverageEnd = coverageList.at(-1) ?? null;
  const coverageDays = coverageList.length;

  const salesMap = new Map<string, AggregatedSales>();

  for (const row of summaryRows) {
    const current = salesMap.get(row.itemCode) ?? {
      qtyTotal: 0,
      salesValueTotal: 0,
      frequencyScore: 0,
      category: row.category,
      itemName: row.itemName,
      periods: new Set<string>(),
    };
    current.qtyTotal += row.qtySold;
    current.salesValueTotal += row.netSales ?? row.grossSales ?? 0;
    current.periods.add(`${row.periodStart}|${row.periodEnd}`);
    current.frequencyScore = current.periods.size;
    salesMap.set(row.itemCode, current);
  }

  const transactionFrequency = new Map<string, Set<string>>();
  for (const row of transactionRows) {
    const current = salesMap.get(row.itemCode) ?? {
      qtyTotal: 0,
      salesValueTotal: 0,
      frequencyScore: 0,
      category: row.category,
      itemName: row.itemName,
      periods: new Set<string>(),
    };
    current.qtyTotal += row.qtySold;
    current.salesValueTotal += row.netSales ?? row.grossSales ?? 0;
    salesMap.set(row.itemCode, current);

    const idSet = transactionFrequency.get(row.itemCode) ?? new Set<string>();
    idSet.add(row.transactionId ?? `${row.saleDate}-${row.itemCode}-${row.qtySold}`);
    transactionFrequency.set(row.itemCode, idSet);
  }

  for (const [itemCode, ids] of transactionFrequency.entries()) {
    const current = salesMap.get(itemCode);
    if (current) {
      current.frequencyScore += ids.size;
    }
  }

  const itemIndex = new Map<string, (typeof masterRows)[number]>();
  for (const row of masterRows) {
    itemIndex.set(row.itemCode, row);
  }

  const allCodes = new Set<string>([...itemIndex.keys(), ...salesMap.keys()]);
  const analysisRows: AnalysisComputation["items"] = [];

  for (const itemCode of allCodes) {
    const master = itemIndex.get(itemCode);
    const sales = salesMap.get(itemCode);
    const itemName = master?.itemName ?? sales?.itemName ?? itemCode;
    const category = master?.category ?? sales?.category ?? null;
    const brand = master?.brand ?? null;
    const currentStock = master?.currentStock ?? 0;
    const minimumStock = master?.minimumStock ?? null;
    const basePrice = master?.basePrice ?? null;
    const qtyTotal = sales?.qtyTotal ?? 0;
    const salesValueTotal = sales?.salesValueTotal ?? 0;
    const periodCount = sales?.periods.size ?? 0;
    const frequencyScore = sales?.frequencyScore ?? 0;
    const avgDailySales = coverageDays > 0 ? qtyTotal / coverageDays : 0;
    const avgMonthlySales = avgDailySales * 30;
    const safetyStock = Math.max(2, Math.ceil(avgDailySales * 7));
    const reorderPoint = Math.max(minimumStock ?? 0, Math.ceil(avgDailySales * 14) + safetyStock);
    const targetStock30 = Math.ceil(avgDailySales * 30) + safetyStock;
    const coverageDaysValue = avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : null;

    const stockStatus: StockStatus =
      currentStock === 0 ? "Kosong" : currentStock <= reorderPoint ? "Rendah" : "Aman";

    let movementClass: MovementClass = "Slow Moving";
    if (qtyTotal === 0 && currentStock > 0) movementClass = "Dead Moving";
    else if (qtyTotal > 0 && ((coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 30 || avgMonthlySales >= 5 || frequencyScore >= 4)) movementClass = "Fast Moving";
    else if (qtyTotal > 0 && ((coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 60 || avgMonthlySales >= 2)) movementClass = "Medium Moving";

    let purchasePriority: PurchasePriority = "Low";
    if ((stockStatus === "Kosong" && qtyTotal > 0) || (stockStatus === "Rendah" && movementClass === "Fast Moving") || ((coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 14 && qtyTotal > 0)) {
      purchasePriority = "High";
    } else if ((stockStatus === "Rendah" && movementClass === "Medium Moving") || (stockStatus === "Aman" && (coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 30 && qtyTotal > 0)) {
      purchasePriority = "Medium";
    }

    const recommendedOrderQty = Math.max(0, targetStock30 - currentStock);
    const stockUrgency = stockStatus === "Kosong" ? 60 : stockStatus === "Rendah" ? 35 : 10;
    const demandScore = Math.min(25, Math.ceil(avgMonthlySales * 3));
    const movementScore =
      movementClass === "Fast Moving"
        ? 15
        : movementClass === "Medium Moving"
          ? 8
          : movementClass === "Dead Moving"
            ? -10
            : 0;

    const reasons: string[] = [];
    if (stockStatus === "Kosong" && qtyTotal > 0) reasons.push("Stok 0, penjualan tinggi pada periode aktif");
    if (stockStatus === "Rendah" && movementClass === "Fast Moving") reasons.push("Stok rendah, barang cepat terjual");
    if ((coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 14 && qtyTotal > 0) reasons.push("Estimasi stok habis kurang dari 14 hari");
    if (purchasePriority === "Medium" && qtyTotal > 0) reasons.push("Permintaan stabil, disarankan isi ulang");
    if (movementClass === "Slow Moving") reasons.push("Stok masih tinggi, lambat terjual");
    if (movementClass === "Dead Moving") reasons.push("Barang tidak bergerak pada periode aktif");

    analysisRows.push({
      itemCode,
      itemName,
      category,
      brand,
      currentStock: round(currentStock),
      minimumStock: minimumStock != null ? round(minimumStock) : null,
      basePrice: basePrice != null ? round(basePrice) : null,
      qtyTotal: round(qtyTotal),
      salesValueTotal: round(salesValueTotal),
      periodDays: coverageDays,
      periodCount,
      frequencyScore: round(frequencyScore),
      avgMonthlySales: round(avgMonthlySales),
      avgDailySales: round(avgDailySales),
      coverageDays: coverageDaysValue,
      stockStatus,
      movementClass,
      purchasePriority,
      recommendedOrderQty: round(recommendedOrderQty),
      priorityScore: stockUrgency + demandScore + movementScore,
      reasons,
      deadStockFlag: movementClass === "Dead Moving",
    });
  }

  const estimatedRows = analysisRows.filter((row) => row.recommendedOrderQty > 0);
  const estimatedRestockValue = estimatedRows.reduce((sum, row) => {
    if (row.basePrice == null) return sum;
    return sum + row.basePrice * row.recommendedOrderQty;
  }, 0);
  const hasPartialCosting = estimatedRows.some((row) => row.basePrice == null);

  return {
    items: analysisRows,
    summary: {
      totalItems: analysisRows.length,
      totalOutOfStock: analysisRows.filter((row) => row.stockStatus === "Kosong").length,
      totalLowStock: analysisRows.filter((row) => row.stockStatus === "Rendah").length,
      totalFastMoving: analysisRows.filter((row) => row.movementClass === "Fast Moving").length,
      totalSlowMoving: analysisRows.filter((row) => row.movementClass === "Slow Moving").length,
      totalDeadMoving: analysisRows.filter((row) => row.movementClass === "Dead Moving").length,
      totalPriorityBuy: analysisRows.filter((row) => row.purchasePriority === "High").length,
      estimatedRestockValue,
      hasPartialCosting,
      coverageStart,
      coverageEnd,
      coverageDays,
      stockDistribution: [
        { label: "Kosong", value: analysisRows.filter((row) => row.stockStatus === "Kosong").length },
        { label: "Rendah", value: analysisRows.filter((row) => row.stockStatus === "Rendah").length },
        { label: "Aman", value: analysisRows.filter((row) => row.stockStatus === "Aman").length },
      ],
      movementDistribution: [
        { label: "Fast", value: analysisRows.filter((row) => row.movementClass === "Fast Moving").length },
        { label: "Medium", value: analysisRows.filter((row) => row.movementClass === "Medium Moving").length },
        { label: "Slow", value: analysisRows.filter((row) => row.movementClass === "Slow Moving").length },
        { label: "Dead", value: analysisRows.filter((row) => row.movementClass === "Dead Moving").length },
      ],
    },
  };
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS upload_batches (
    id TEXT PRIMARY KEY,
    dataset_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    is_active INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_count INTEGER NOT NULL DEFAULT 0,
    period_start TEXT,
    period_end TEXT,
    mapping_json TEXT NOT NULL DEFAULT '{}',
    validation_summary_json TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    description TEXT,
    variant TEXT,
    selling_price REAL,
    base_price REAL,
    current_stock REAL NOT NULL DEFAULT 0,
    minimum_stock REAL,
    FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sales_transaction_records (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    transaction_id TEXT,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    qty_sold REAL NOT NULL DEFAULT 0,
    gross_sales REAL,
    net_sales REAL,
    FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sales_summary_records (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    qty_sold REAL NOT NULL DEFAULT 0,
    gross_sales REAL,
    service_fee REAL,
    taxes REAL,
    net_sales REAL,
    FOREIGN KEY(batch_id) REFERENCES upload_batches(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS analysis_items (
    id TEXT PRIMARY KEY,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    current_stock REAL NOT NULL DEFAULT 0,
    minimum_stock REAL,
    base_price REAL,
    qty_total REAL NOT NULL DEFAULT 0,
    sales_value_total REAL NOT NULL DEFAULT 0,
    period_days INTEGER NOT NULL DEFAULT 0,
    period_count INTEGER NOT NULL DEFAULT 0,
    frequency_score REAL NOT NULL DEFAULT 0,
    avg_monthly_sales REAL NOT NULL DEFAULT 0,
    avg_daily_sales REAL NOT NULL DEFAULT 0,
    coverage_days INTEGER,
    stock_status TEXT NOT NULL,
    movement_class TEXT NOT NULL,
    purchase_priority TEXT NOT NULL,
    recommended_order_qty REAL NOT NULL DEFAULT 0,
    priority_score REAL NOT NULL DEFAULT 0,
    reason_json TEXT NOT NULL DEFAULT '[]',
    dead_stock_flag INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS analysis_summary (
    id TEXT PRIMARY KEY,
    refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_out_of_stock INTEGER NOT NULL DEFAULT 0,
    total_low_stock INTEGER NOT NULL DEFAULT 0,
    total_fast_moving INTEGER NOT NULL DEFAULT 0,
    total_slow_moving INTEGER NOT NULL DEFAULT 0,
    total_dead_moving INTEGER NOT NULL DEFAULT 0,
    total_priority_buy INTEGER NOT NULL DEFAULT 0,
    estimated_restock_value REAL NOT NULL DEFAULT 0,
    has_partial_costing INTEGER NOT NULL DEFAULT 0,
    coverage_start TEXT,
    coverage_end TEXT,
    coverage_days INTEGER NOT NULL DEFAULT 0,
    stock_distribution_json TEXT NOT NULL DEFAULT '[]',
    movement_distribution_json TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_upload_batches_dataset_active_uploaded
    ON upload_batches(dataset_type, is_active, uploaded_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_upload_batches_active_type
    ON upload_batches(is_active, dataset_type)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_items_batch_code
    ON inventory_items(batch_id, item_code)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_items_batch_name
    ON inventory_items(batch_id, item_name)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_summary_records_batch_code
    ON sales_summary_records(batch_id, item_code)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_summary_records_batch_period
    ON sales_summary_records(batch_id, period_start, period_end)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_transaction_records_batch_code
    ON sales_transaction_records(batch_id, item_code)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_transaction_records_batch_date
    ON sales_transaction_records(batch_id, sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_analysis_items_item_code
    ON analysis_items(item_code)`,
  `CREATE INDEX IF NOT EXISTS idx_analysis_items_priority
    ON analysis_items(purchase_priority, priority_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_analysis_items_movement
    ON analysis_items(movement_class)`,
  `CREATE INDEX IF NOT EXISTS idx_analysis_items_stock_status
    ON analysis_items(stock_status)`,
];

async function ensureDatabase() {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.run(sql.raw(statement));
  }
}

async function cleanupOrphanRows() {
  await db
    .delete(inventoryItems)
    .where(sql`${inventoryItems.batchId} not in (select ${uploadBatches.id} from ${uploadBatches})`)
    .run();
  await db
    .delete(salesSummaryRecords)
    .where(sql`${salesSummaryRecords.batchId} not in (select ${uploadBatches.id} from ${uploadBatches})`)
    .run();
  await db
    .delete(salesTransactionRecords)
    .where(sql`${salesTransactionRecords.batchId} not in (select ${uploadBatches.id} from ${uploadBatches})`)
    .run();
}

async function seedDemoDataIfEmpty() {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(uploadBatches).get();
  if ((existing?.count ?? 0) > 0) return;

  const masterBatchId = createId("demo_master");
  await db
    .insert(uploadBatches)
    .values({
      id: masterBatchId,
      datasetType: "master",
      filename: "demo-master.xlsx",
      isActive: true,
      rowCount: demoInventoryItems.length,
      mappingJson: toJson(MASTER_PRESET),
      validationSummaryJson: toJson({ type: "demo" }),
      status: "ready",
      uploadedAt: nowIso(),
    })
    .run();

  await db
    .insert(inventoryItems)
    .values(
      demoInventoryItems.map((item) => ({
        id: createId("demo_inventory"),
        batchId: masterBatchId,
        itemCode: item.itemCode,
        itemName: item.itemName,
        category: item.category,
        brand: item.brand,
        description: null,
        variant: null,
        sellingPrice: item.sellingPrice,
        basePrice: item.basePrice,
        currentStock: item.currentStock,
        minimumStock: item.minimumStock,
      })),
    )
    .run();

  for (const batch of demoSummaryBatches) {
    const batchId = createId("demo_sales_summary");
    await db
      .insert(uploadBatches)
      .values({
        id: batchId,
        datasetType: "sales_summary",
        filename: batch.filename,
        isActive: true,
        rowCount: batch.rows.length,
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
        mappingJson: toJson(SALES_SUMMARY_PRESET),
        validationSummaryJson: toJson({ type: "demo" }),
        status: "ready",
        uploadedAt: nowIso(),
      })
      .run();

    await db
      .insert(salesSummaryRecords)
      .values(
        batch.rows.map((row) => ({
          id: createId("demo_summary_row"),
          batchId,
          periodStart: batch.periodStart,
          periodEnd: batch.periodEnd,
          itemCode: row.itemCode,
          itemName: row.itemName,
          category: row.category,
          qtySold: row.qtySold,
          grossSales: row.grossSales,
          serviceFee: 0,
          taxes: 0,
          netSales: row.netSales,
        })),
      )
      .run();
  }

  const txBatchId = createId("demo_sales_transaction");
  await db
    .insert(uploadBatches)
    .values({
      id: txBatchId,
      datasetType: "sales_transaction",
      filename: `${DEMO_SUMMARY_PREFIX}-transactions.csv`,
      isActive: false,
      rowCount: demoTransactionRecords.length,
      periodStart: "2026-03-23",
      periodEnd: "2026-03-26",
      mappingJson: toJson(SALES_TRANSACTION_PRESET),
      validationSummaryJson: toJson({ type: "demo" }),
      status: "ready",
      uploadedAt: nowIso(),
    })
    .run();

  await db
    .insert(salesTransactionRecords)
    .values(
      demoTransactionRecords.map((row) => ({
        id: createId("demo_transaction_row"),
        batchId: txBatchId,
        saleDate: row.saleDate,
        transactionId: row.transactionId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        category: row.category,
        brand: row.brand,
        qtySold: row.qtySold,
        grossSales: row.grossSales,
        netSales: row.netSales,
      })),
    )
    .run();
}
