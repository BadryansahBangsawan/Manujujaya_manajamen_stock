import * as XLSX from "xlsx";

const API = "https://manujujaya-manajemen-stock-api-badry.badryansah99.workers.dev";
const PREVIEW_SAMPLE_ROWS = 250;

const files = {
  master: "/Users/badry/Downloads/total product.xlsx",
  sales: "/Users/badry/Downloads/produk yang laku dari 1 january - 28 maret.xlsx",
};

const MASTER_KEYWORDS = ["stock", "minimum stock", "product code", "barcode"];
const SALES_KEYWORDS = ["number of products sold", "gross sales", "sales", "sale date"];

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreHeaderRow(row) {
  const cells = row.map((v) => normalizeHeader(v)).filter(Boolean);
  if (cells.length < 2) return 0;
  const keywords = [...MASTER_KEYWORDS, ...SALES_KEYWORDS];
  return cells.reduce((score, cell) => score + (keywords.some((k) => cell.includes(k)) ? 5 : 1), 0);
}

function findHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = 0;

  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    const score = scoreHeaderRow(rows[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function parseSpreadsheet(path, fileName) {
  const workbook = XLSX.readFile(path, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = findHeaderRow(rows);
  const headers = (rows[headerIndex] ?? []).map((value) => String(value ?? "").trim());
  const metadataLines = rows
    .slice(0, headerIndex)
    .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" "))
    .filter(Boolean);

  const dataRows = rows.slice(headerIndex + 1).map((row) => {
    const output = {};
    headers.forEach((header, index) => {
      output[header] = row[index] ?? "";
    });
    return output;
  });

  const cleanedRows = dataRows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== ""),
  );

  return {
    fileName,
    headers,
    rows: cleanedRows,
    metadataLines,
  };
}

function compactRowsByMapping(rows, mapping) {
  const selectedHeaders = Array.from(
    new Set(Object.values(mapping).filter((header) => typeof header === "string" && header.length > 0)),
  );
  if (selectedHeaders.length === 0) return rows;

  return rows.map((row) => {
    const compacted = {};
    for (const header of selectedHeaders) {
      compacted[header] = row[header] ?? null;
    }
    return compacted;
  });
}

async function rpc(route, body) {
  const response = await fetch(`${API}/rpc/${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ json: body ?? {} }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`RPC ${route} failed: ${response.status} ${response.statusText} -> ${text.slice(0, 700)}`);
  }

  return JSON.parse(text).json;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableUploadError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("503") ||
    message.includes("Failed to fetch") ||
    message.includes("Internal server error")
  );
};

async function appendMasterChunkWithRetry(batchId, rows, mapping, attempt = 0) {
  try {
    await rpc("uploads/appendMasterChunk", {
      batchId,
      rows,
      mapping,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable =
      message.includes("503") ||
      message.includes("Failed to fetch") ||
      message.includes("Internal server error");

    if (retryable && rows.length > 20) {
      const middle = Math.ceil(rows.length / 2);
      await appendMasterChunkWithRetry(batchId, rows.slice(0, middle), mapping, attempt);
      await appendMasterChunkWithRetry(batchId, rows.slice(middle), mapping, attempt);
      return;
    }

    if (retryable && attempt < 5) {
      await sleep(700 * (attempt + 1));
      await appendMasterChunkWithRetry(batchId, rows, mapping, attempt + 1);
      return;
    }

    throw error;
  }
}

async function appendSalesSummaryChunkWithRetry(batchId, rows, mapping, attempt = 0) {
  try {
    await rpc("uploads/appendSalesSummaryChunk", {
      batchId,
      rows,
      mapping,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable =
      message.includes("503") ||
      message.includes("Failed to fetch") ||
      message.includes("Internal server error");

    if (retryable && rows.length > 20) {
      const middle = Math.ceil(rows.length / 2);
      await appendSalesSummaryChunkWithRetry(batchId, rows.slice(0, middle), mapping, attempt);
      await appendSalesSummaryChunkWithRetry(batchId, rows.slice(middle), mapping, attempt);
      return;
    }

    if (retryable && attempt < 5) {
      await sleep(700 * (attempt + 1));
      await appendSalesSummaryChunkWithRetry(batchId, rows, mapping, attempt + 1);
      return;
    }

    throw error;
  }
}

const masterParsed = parseSpreadsheet(files.master, "total product.xlsx");
const masterPreview = await rpc("uploads/previewFile", {
  ...masterParsed,
  datasetType: "master",
  rows: masterParsed.rows.slice(0, PREVIEW_SAMPLE_ROWS),
  totalRows: masterParsed.rows.length,
});
console.log("[master] detected:", masterPreview.detectedDatasetType);
console.log("[master] missing:", masterPreview.missingRequiredFields);

const masterStart = await rpc("uploads/startMasterImport", {
  fileName: masterParsed.fileName,
  rowCount: masterParsed.rows.length,
  mapping: masterPreview.suggestedMapping,
});
console.log("[master] start:", masterStart);

let masterChunkSize = 300;
try {
  const compactMasterRows = compactRowsByMapping(masterParsed.rows, masterPreview.suggestedMapping);
  const minimumChunkSize = 20;
  for (let index = 0; index < compactMasterRows.length; ) {
    const rowsChunk = compactMasterRows.slice(index, index + masterChunkSize);
    try {
      await appendMasterChunkWithRetry(masterStart.batchId, rowsChunk, masterPreview.suggestedMapping);
      index += rowsChunk.length;
      const processed = Math.min(compactMasterRows.length, index);
      console.log(`[master] chunk ${processed}/${compactMasterRows.length}`);
      await sleep(80);
    } catch (error) {
      if (isRetryableUploadError(error) && masterChunkSize > minimumChunkSize) {
        masterChunkSize = Math.max(minimumChunkSize, Math.floor(masterChunkSize / 2));
        continue;
      }
      throw error;
    }
  }

  const masterCommit = await rpc("uploads/finalizeMasterImport", {
    batchId: masterStart.batchId,
  });
  console.log("[master] commit:", masterCommit);
} catch (error) {
  await rpc("uploads/deleteBatch", { batchId: masterStart.batchId }).catch(() => {});
  throw error;
}

const salesParsed = parseSpreadsheet(files.sales, "produk yang laku dari 1 january - 28 maret.xlsx");
const salesPreview = await rpc("uploads/previewFile", {
  ...salesParsed,
  datasetType: "sales",
  rows: salesParsed.rows.slice(0, PREVIEW_SAMPLE_ROWS),
  totalRows: salesParsed.rows.length,
});
console.log("[sales] detected:", salesPreview.detectedDatasetType);
console.log("[sales] missing:", salesPreview.missingRequiredFields);

const salesStart = await rpc("uploads/startSalesSummaryImport", {
  fileName: salesParsed.fileName,
  rowCount: salesParsed.rows.length,
  mapping: salesPreview.suggestedMapping,
  periodStart: salesPreview.inferredPeriodStart ?? "2026-03-21",
  periodEnd: salesPreview.inferredPeriodEnd ?? "2026-03-28",
});
console.log("[sales] start:", salesStart);

let salesChunkSize = 200;
try {
  const compactSalesRows = compactRowsByMapping(salesParsed.rows, salesPreview.suggestedMapping);
  const minimumChunkSize = 20;
  for (let index = 0; index < compactSalesRows.length; ) {
    const rowsChunk = compactSalesRows.slice(index, index + salesChunkSize);
    try {
      await appendSalesSummaryChunkWithRetry(salesStart.batchId, rowsChunk, salesPreview.suggestedMapping);
      index += rowsChunk.length;
      const processed = Math.min(compactSalesRows.length, index);
      console.log(`[sales] chunk ${processed}/${compactSalesRows.length}`);
      await sleep(60);
    } catch (error) {
      if (isRetryableUploadError(error) && salesChunkSize > minimumChunkSize) {
        salesChunkSize = Math.max(minimumChunkSize, Math.floor(salesChunkSize / 2));
        continue;
      }
      throw error;
    }
  }
  const salesCommit = await rpc("uploads/finalizeSalesSummaryImport", { batchId: salesStart.batchId });
  console.log("[sales] commit:", salesCommit);
} catch (error) {
  await rpc("uploads/deleteBatch", { batchId: salesStart.batchId }).catch(() => {});
  throw error;
}

const summary = await rpc("dashboard/getSummary", {});
console.log("[summary] kpi:", {
  totalItems: summary.summary?.totalItems,
  totalOutOfStock: summary.summary?.totalOutOfStock,
  totalLowStock: summary.summary?.totalLowStock,
  totalPriorityBuy: summary.summary?.totalPriorityBuy,
});

const history = await rpc("uploads/listHistory", {});
console.log("[history] count:", history.length);
