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
};

export type UploadMapping = Record<string, string | null | undefined>;

export type CommitPayload = PreviewPayload & {
  mapping: UploadMapping;
  periodStart?: string | null;
  periodEnd?: string | null;
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
  }
}

async function ensureRuntimeReady() {
  if (runtimeInitPromise) {
    await runtimeInitPromise;
    return;
  }

  runtimeInitPromise = (async () => {
    if (configuredD1) {
      db = drizzleD1(configuredD1, { schema });
    } else {
      const libsqlClient: LibsqlClient = createClient({ url: resolveSqlitePath() });
      db = drizzleLibsql(libsqlClient, { schema });
    }

    await ensureDatabase();
    if (!configuredD1) {
      await seedDemoDataIfEmpty();
    }
    await refreshAnalysisSnapshot();
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

function cleanText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
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

async function insertInChunks<T>(table: any, rows: T[], chunkSize = 1) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await db.insert(table).values(rows.slice(index, index + chunkSize)).run();
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
    rowCount: payload.rows.length,
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

  const missing = requiredFieldsFor("master").filter((field) => !effectiveMapping[field]);
  if (missing.length > 0) {
    throw new Error(`Mapping master belum lengkap: ${missing.join(", ")}`);
  }

  await maybeDeactivateDemoBatches("master");

  const batchId = createId("master");
  const validationSummary = { requiredFields: requiredFieldsFor("master"), missingFields: [] };

  await db.update(uploadBatches).set({ isActive: false }).where(eq(uploadBatches.datasetType, "master")).run();
  await db
    .insert(uploadBatches)
    .values({
      id: batchId,
      datasetType: "master",
      filename: payload.fileName,
      isActive: true,
      rowCount: payload.rows.length,
      mappingJson: toJson(effectiveMapping),
      validationSummaryJson: toJson(validationSummary),
      status: "ready",
      uploadedAt: nowIso(),
    })
    .run();

  const rows = payload.rows
    .map((row) => ({
      id: createId("inventory"),
      batchId,
      itemCode: cleanText(resolveValue(row, effectiveMapping, "item_code")),
      itemName: cleanText(resolveValue(row, effectiveMapping, "item_name")),
      category: cleanText(resolveValue(row, effectiveMapping, "category")) || null,
      brand: cleanText(resolveValue(row, effectiveMapping, "brand")) || null,
      description: cleanText(resolveValue(row, effectiveMapping, "description")) || null,
      variant: cleanText(resolveValue(row, effectiveMapping, "variant")) || null,
      sellingPrice: parseNumber(resolveValue(row, effectiveMapping, "selling_price")) || null,
      basePrice: parseNumber(resolveValue(row, effectiveMapping, "base_price")) || null,
      currentStock: parseNumber(resolveValue(row, effectiveMapping, "current_stock")),
      minimumStock: parseNumber(resolveValue(row, effectiveMapping, "minimum_stock")) || null,
    }))
    .filter((row) => row.itemCode && row.itemName);

  if (rows.length > 0) {
    await insertInChunks(inventoryItems, rows);
  }

  await refreshAnalysisSnapshot();

  return { batchId, importedRows: rows.length };
}

export async function commitSalesSummaryUpload(payload: CommitPayload) {
  await ensureRuntimeReady();
  const preview = previewParsedFile(payload);
  const periodStart = payload.periodStart ?? preview.inferredPeriodStart;
  const periodEnd = payload.periodEnd ?? preview.inferredPeriodEnd;

  if (!periodStart || !periodEnd) {
    throw new Error("Period start dan period end wajib diisi untuk sales summary.");
  }

  const missing = requiredFieldsFor("sales_summary").filter((field) => !payload.mapping[field]);
  if (missing.length > 0) {
    throw new Error(`Mapping sales summary belum lengkap: ${missing.join(", ")}`);
  }

  await maybeDeactivateDemoBatches("sales");

  const batchId = createId("sales_summary");
  await db
    .insert(uploadBatches)
    .values({
      id: batchId,
      datasetType: "sales_summary",
      filename: payload.fileName,
      isActive: true,
      rowCount: payload.rows.length,
      periodStart,
      periodEnd,
      mappingJson: toJson(payload.mapping),
      validationSummaryJson: toJson({ requiredFields: requiredFieldsFor("sales_summary"), missingFields: [] }),
      status: "ready",
      uploadedAt: nowIso(),
    })
    .run();

  const rows = payload.rows
    .map((row) => ({
      id: createId("sales_summary_row"),
      batchId,
      periodStart,
      periodEnd,
      itemCode: cleanText(resolveValue(row, payload.mapping, "item_code")),
      itemName: cleanText(resolveValue(row, payload.mapping, "item_name")) || cleanText(resolveValue(row, payload.mapping, "item_code")),
      category: cleanText(resolveValue(row, payload.mapping, "category")) || null,
      qtySold: parseNumber(resolveValue(row, payload.mapping, "qty_sold")),
      grossSales: parseNumber(resolveValue(row, payload.mapping, "gross_sales")) || null,
      serviceFee: parseNumber(resolveValue(row, payload.mapping, "service_fee")) || null,
      taxes: parseNumber(resolveValue(row, payload.mapping, "taxes")) || null,
      netSales: parseNumber(resolveValue(row, payload.mapping, "net_sales")) || null,
    }))
    .filter((row) => row.itemCode);

  if (rows.length > 0) {
    await insertInChunks(salesSummaryRecords, rows);
  }

  await refreshAnalysisSnapshot();

  return { batchId, importedRows: rows.length, periodStart, periodEnd };
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
    await insertInChunks(salesTransactionRecords, rows);
  }

  await refreshAnalysisSnapshot();

  return { batchId, importedRows: rows.length, periodStart, periodEnd };
}

export async function listUploadHistory() {
  await ensureRuntimeReady();
  return db.select().from(uploadBatches).orderBy(desc(uploadBatches.uploadedAt)).all();
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

  await db.delete(uploadBatches).where(eq(uploadBatches.id, batchId)).run();
  await refreshAnalysisSnapshot();

  return { success: true, deletedBatchId: batchId };
}

async function readSummaryRow(): Promise<AnalysisSummary | undefined> {
  return db.select().from(analysisSummary).get();
}

async function readAnalysisItems(): Promise<AnalysisItem[]> {
  return db.select().from(analysisItems).all();
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
  const summary = await readSummaryRow();
  const items = await readAnalysisItems();
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
  const items = await readAnalysisItems();
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

  for (const batch of summaryBatches) {
    const label = batch.periodStart && batch.periodEnd ? `${batch.periodStart} → ${batch.periodEnd}` : batch.filename;
    const rowTotals = await db
      .select({
        qty: sql<number>`coalesce(sum(${salesSummaryRecords.qtySold}), 0)`,
        sales: sql<number>`coalesce(sum(coalesce(${salesSummaryRecords.netSales}, ${salesSummaryRecords.grossSales})), 0)`,
      })
      .from(salesSummaryRecords)
      .where(eq(salesSummaryRecords.batchId, batch.id))
      .get();

    trendMap.set(label, {
      label,
      qty: round(rowTotals?.qty ?? 0),
      sales: round(rowTotals?.sales ?? 0),
    });
  }

  if (transactionBatches.length > 0) {
    const rows = await db
      .select()
      .from(salesTransactionRecords)
      .where(inArray(salesTransactionRecords.batchId, transactionBatches.map((batch: UploadBatch) => batch.id)))
      .all();

    const grouped = new Map<string, TrendPoint>();
    for (const row of rows) {
      const label = row.saleDate.slice(0, 7);
      const current = grouped.get(label) ?? { label, qty: 0, sales: 0 };
      current.qty += row.qtySold;
      current.sales += row.netSales ?? row.grossSales ?? 0;
      grouped.set(label, current);
    }

    for (const [label, point] of grouped.entries()) {
      trendMap.set(label, { label, qty: round(point.qty), sales: round(point.sales) });
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
  return buildFilteredItems(filters, await readAnalysisItems());
}

export async function listPurchaseRecommendations(filters: ListFilters) {
  await ensureRuntimeReady();
  const items = (await readAnalysisItems()).filter(
    (item) => item.purchasePriority !== "Low" || item.qtyTotal > 0,
  );
  return buildFilteredItems({ ...filters, sortBy: filters.sortBy ?? "priorityScore" }, items);
}

export async function listSlowMoving(filters: ListFilters) {
  await ensureRuntimeReady();
  return buildFilteredItems(
    { ...filters, sortBy: filters.sortBy ?? "coverageDays" },
    (await readAnalysisItems()).filter(
      (item) =>
        item.movementClass === "Slow Moving" ||
        item.movementClass === "Dead Moving" ||
        (item.currentStock > 10 && item.qtyTotal < 3),
    ),
  );
}

export async function getItemDetail(itemCode: string) {
  await ensureRuntimeReady();
  const item = await db.select().from(analysisItems).where(eq(analysisItems.itemCode, itemCode)).get();
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

async function refreshAnalysisSnapshot() {
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
    if (stockStatus === "Rendah" && movementClass === "Fast Moving") reasons.push("Stok rendah, barang fast moving");
    if ((coverageDaysValue ?? Number.MAX_SAFE_INTEGER) <= 14 && qtyTotal > 0) reasons.push("Estimasi stok habis kurang dari 14 hari");
    if (purchasePriority === "Medium" && qtyTotal > 0) reasons.push("Permintaan stabil, disarankan isi ulang");
    if (movementClass === "Slow Moving") reasons.push("Stok masih tinggi, pergerakan lambat");
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
];

async function ensureDatabase() {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.run(sql.raw(statement));
  }
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
