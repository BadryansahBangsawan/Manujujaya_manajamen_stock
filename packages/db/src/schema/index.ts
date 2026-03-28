import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const uploadBatches = sqliteTable(
  "upload_batches",
  {
    id: text("id").primaryKey(),
    datasetType: text("dataset_type").notNull(),
    filename: text("filename").notNull(),
    status: text("status").notNull().default("ready"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    rowCount: integer("row_count").notNull().default(0),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    mappingJson: text("mapping_json").notNull().default("{}"),
    validationSummaryJson: text("validation_summary_json").notNull().default("{}"),
  },
  (table) => ({
    datasetTypeIdx: uniqueIndex("upload_batches_id_idx").on(table.id),
  }),
);

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => uploadBatches.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category"),
  brand: text("brand"),
  description: text("description"),
  variant: text("variant"),
  sellingPrice: real("selling_price"),
  basePrice: real("base_price"),
  currentStock: real("current_stock").notNull().default(0),
  minimumStock: real("minimum_stock"),
});

export const salesTransactionRecords = sqliteTable("sales_transaction_records", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => uploadBatches.id, { onDelete: "cascade" }),
  saleDate: text("sale_date").notNull(),
  transactionId: text("transaction_id"),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category"),
  brand: text("brand"),
  qtySold: real("qty_sold").notNull().default(0),
  grossSales: real("gross_sales"),
  netSales: real("net_sales"),
});

export const salesSummaryRecords = sqliteTable("sales_summary_records", {
  id: text("id").primaryKey(),
  batchId: text("batch_id")
    .notNull()
    .references(() => uploadBatches.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category"),
  qtySold: real("qty_sold").notNull().default(0),
  grossSales: real("gross_sales"),
  serviceFee: real("service_fee"),
  taxes: real("taxes"),
  netSales: real("net_sales"),
});

export const analysisItems = sqliteTable("analysis_items", {
  id: text("id").primaryKey(),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  category: text("category"),
  brand: text("brand"),
  currentStock: real("current_stock").notNull().default(0),
  minimumStock: real("minimum_stock"),
  basePrice: real("base_price"),
  qtyTotal: real("qty_total").notNull().default(0),
  salesValueTotal: real("sales_value_total").notNull().default(0),
  periodDays: integer("period_days").notNull().default(0),
  periodCount: integer("period_count").notNull().default(0),
  frequencyScore: real("frequency_score").notNull().default(0),
  avgMonthlySales: real("avg_monthly_sales").notNull().default(0),
  avgDailySales: real("avg_daily_sales").notNull().default(0),
  coverageDays: integer("coverage_days"),
  stockStatus: text("stock_status").notNull(),
  movementClass: text("movement_class").notNull(),
  purchasePriority: text("purchase_priority").notNull(),
  recommendedOrderQty: real("recommended_order_qty").notNull().default(0),
  priorityScore: real("priority_score").notNull().default(0),
  reasonJson: text("reason_json").notNull().default("[]"),
  deadStockFlag: integer("dead_stock_flag", { mode: "boolean" }).notNull().default(false),
});

export const analysisSummary = sqliteTable("analysis_summary", {
  id: text("id").primaryKey(),
  refreshedAt: text("refreshed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  totalItems: integer("total_items").notNull().default(0),
  totalOutOfStock: integer("total_out_of_stock").notNull().default(0),
  totalLowStock: integer("total_low_stock").notNull().default(0),
  totalFastMoving: integer("total_fast_moving").notNull().default(0),
  totalSlowMoving: integer("total_slow_moving").notNull().default(0),
  totalDeadMoving: integer("total_dead_moving").notNull().default(0),
  totalPriorityBuy: integer("total_priority_buy").notNull().default(0),
  estimatedRestockValue: real("estimated_restock_value").notNull().default(0),
  hasPartialCosting: integer("has_partial_costing", { mode: "boolean" }).notNull().default(false),
  coverageStart: text("coverage_start"),
  coverageEnd: text("coverage_end"),
  coverageDays: integer("coverage_days").notNull().default(0),
  stockDistributionJson: text("stock_distribution_json").notNull().default("[]"),
  movementDistributionJson: text("movement_distribution_json").notNull().default("[]"),
});

export type UploadBatch = typeof uploadBatches.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type SalesTransactionRecord = typeof salesTransactionRecords.$inferSelect;
export type SalesSummaryRecord = typeof salesSummaryRecords.$inferSelect;
export type AnalysisItem = typeof analysisItems.$inferSelect;
export type AnalysisSummary = typeof analysisSummary.$inferSelect;
