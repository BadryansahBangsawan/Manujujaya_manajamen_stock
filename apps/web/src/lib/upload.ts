import * as XLSX from "xlsx";

const MASTER_KEYWORDS = ["stock", "minimum stock", "product code", "barcode"];
const SALES_KEYWORDS = ["number of products sold", "gross sales", "sales", "sale date"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreHeaderRow(row: unknown[]) {
  const cells = row.map((value) => normalizeHeader(String(value ?? ""))).filter(Boolean);
  if (cells.length < 2) return 0;
  const keywords = [...MASTER_KEYWORDS, ...SALES_KEYWORDS];
  return cells.reduce((score, cell) => {
    return score + (keywords.some((keyword) => cell.includes(keyword)) ? 5 : 1);
  }, 0);
}

function findHeaderRow(rows: unknown[][]) {
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

export async function parseSpreadsheet(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = findHeaderRow(rows);
  const headers = (rows[headerIndex] ?? []).map((value) => String(value ?? "").trim());
  const metadataLines = rows
    .slice(0, headerIndex)
    .map((row) => row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" "))
    .filter(Boolean);
  const dataRows = rows.slice(headerIndex + 1).map((row) => {
    return headers.reduce<Record<string, unknown>>((accumulator, header, index) => {
      accumulator[header] = row[index] ?? "";
      return accumulator;
    }, {});
  });

  const cleanedRows = dataRows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== ""),
  );

  return {
    fileName: file.name,
    headers,
    rows: cleanedRows,
    metadataLines,
    totalRows: cleanedRows.length,
  };
}
