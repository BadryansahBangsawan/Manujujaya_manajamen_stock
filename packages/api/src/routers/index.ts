import type { RouterClient } from "@orpc/server";
import {
  appendMasterUploadChunk,
  appendSalesSummaryChunk,
  commitMasterUpload,
  commitSalesSummaryUpload,
  commitSalesTransactionUpload,
  deleteBatch,
  finalizeMasterUpload,
  finalizeSalesSummaryUpload,
  getBatchDetail,
  getDashboardCharts,
  getDashboardSummary,
  getItemDetail,
  getReportsPayload,
  listInventory,
  listPurchaseRecommendations,
  listSlowMoving,
  listUploadHistory,
  previewParsedFile,
  setActiveBatches,
  startSalesSummaryUpload,
  startMasterUpload,
} from "@Manujujaya-Manajemen-stock/db";
import { z } from "zod";

import { publicProcedure } from "../index";

const parsedRowSchema = z.record(z.string(), z.any());

const previewSchema = z.object({
  fileName: z.string().min(1),
  datasetType: z.enum(["master", "sales"]),
  headers: z.array(z.string()).min(1),
  rows: z.array(parsedRowSchema),
  metadataLines: z.array(z.string()).optional(),
  totalRows: z.number().int().nonnegative().optional(),
});

const mappingSchema = z.record(z.string(), z.string().nullable().optional());

const commitSchema = previewSchema.extend({
  mapping: mappingSchema,
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
});

const startMasterImportSchema = z.object({
  fileName: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  mapping: mappingSchema,
});

const appendMasterChunkSchema = z.object({
  batchId: z.string().min(1),
  rows: z.array(parsedRowSchema),
  mapping: mappingSchema,
});

const startSalesSummaryImportSchema = z.object({
  fileName: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  mapping: mappingSchema,
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

const appendSalesSummaryChunkSchema = z.object({
  batchId: z.string().min(1),
  rows: z.array(parsedRowSchema),
  mapping: mappingSchema,
});

const filtersSchema = z.object({
  search: z.string().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  stockStatus: z.enum(["Kosong", "Rendah", "Aman"]).nullable().optional(),
  purchasePriority: z.enum(["High", "Medium", "Low"]).nullable().optional(),
  movementClass: z
    .enum(["Fast Moving", "Medium Moving", "Slow Moving", "Dead Moving"])
    .nullable()
    .optional(),
  sortBy: z
    .enum([
      "priorityScore",
      "qtyTotal",
      "currentStock",
      "itemName",
      "salesValueTotal",
      "coverageDays",
    ])
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  uploads: {
    previewFile: publicProcedure.input(previewSchema).handler(({ input }) => previewParsedFile(input)),
    commitMaster: publicProcedure.input(commitSchema).handler(({ input }) => commitMasterUpload(input)),
    startMasterImport: publicProcedure
      .input(startMasterImportSchema)
      .handler(({ input }) => startMasterUpload(input)),
    appendMasterChunk: publicProcedure
      .input(appendMasterChunkSchema)
      .handler(({ input }) => appendMasterUploadChunk(input)),
    finalizeMasterImport: publicProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .handler(({ input }) => finalizeMasterUpload(input)),
    startSalesSummaryImport: publicProcedure
      .input(startSalesSummaryImportSchema)
      .handler(({ input }) => startSalesSummaryUpload(input)),
    appendSalesSummaryChunk: publicProcedure
      .input(appendSalesSummaryChunkSchema)
      .handler(({ input }) => appendSalesSummaryChunk(input)),
    finalizeSalesSummaryImport: publicProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .handler(({ input }) => finalizeSalesSummaryUpload(input)),
    commitSalesSummary: publicProcedure
      .input(commitSchema)
      .handler(({ input }) => commitSalesSummaryUpload(input)),
    commitSalesTransaction: publicProcedure
      .input(commitSchema)
      .handler(({ input }) => commitSalesTransactionUpload(input)),
    listHistory: publicProcedure.handler(() => listUploadHistory()),
    setActiveBatches: publicProcedure
      .input(
        z.object({
          masterBatchId: z.string().nullable().optional(),
          salesBatchIds: z.array(z.string()).default([]),
        }),
      )
      .handler(({ input }) => setActiveBatches(input)),
    getBatchDetail: publicProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .handler(({ input }) => getBatchDetail(input.batchId)),
    deleteBatch: publicProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .handler(({ input }) => deleteBatch(input.batchId)),
  },
  dashboard: {
    getSummary: publicProcedure.handler(() => getDashboardSummary()),
    getCharts: publicProcedure.handler(() => getDashboardCharts()),
  },
  inventory: {
    list: publicProcedure.input(filtersSchema.optional()).handler(({ input }) => listInventory(input ?? {})),
  },
  purchase: {
    list: publicProcedure
      .input(filtersSchema.optional())
      .handler(({ input }) => listPurchaseRecommendations(input ?? {})),
  },
  slowMoving: {
    list: publicProcedure.input(filtersSchema.optional()).handler(({ input }) => listSlowMoving(input ?? {})),
  },
  items: {
    getDetail: publicProcedure
      .input(z.object({ itemCode: z.string().min(1) }))
      .handler(({ input }) => getItemDetail(input.itemCode)),
  },
  reports: {
    exportExcel: publicProcedure.handler(() => getReportsPayload()),
    exportPdf: publicProcedure.handler(() => getReportsPayload()),
  },
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
