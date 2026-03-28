import * as XLSX from "xlsx";

const API = "https://manujujaya-manajemen-stock-api-badry.badryansah99.workers.dev";

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

const masterParsed = parseSpreadsheet(files.master, "total product.xlsx");
const masterPreview = await rpc("uploads/previewFile", { ...masterParsed, datasetType: "master" });
console.log("[master] detected:", masterPreview.detectedDatasetType);
console.log("[master] missing:", masterPreview.missingRequiredFields);
const masterCommit = await rpc("uploads/commitMaster", {
  ...masterParsed,
  datasetType: "master",
  mapping: masterPreview.suggestedMapping,
  periodStart: null,
  periodEnd: null,
});
console.log("[master] commit:", masterCommit);

const salesParsed = parseSpreadsheet(files.sales, "produk yang laku dari 1 january - 28 maret.xlsx");
const salesPreview = await rpc("uploads/previewFile", { ...salesParsed, datasetType: "sales" });
console.log("[sales] detected:", salesPreview.detectedDatasetType);
console.log("[sales] missing:", salesPreview.missingRequiredFields);
const salesCommit = await rpc("uploads/commitSalesSummary", {
  ...salesParsed,
  datasetType: "sales",
  mapping: salesPreview.suggestedMapping,
  periodStart: salesPreview.inferredPeriodStart ?? "2026-03-21",
  periodEnd: salesPreview.inferredPeriodEnd ?? "2026-03-28",
});
console.log("[sales] commit:", salesCommit);

const summary = await rpc("dashboard/getSummary", {});
console.log("[summary] kpi:", {
  totalItems: summary.summary?.totalItems,
  totalOutOfStock: summary.summary?.totalOutOfStock,
  totalLowStock: summary.summary?.totalLowStock,
  totalPriorityBuy: summary.summary?.totalPriorityBuy,
});

const history = await rpc("uploads/listHistory", {});
console.log("[history] count:", history.length);
