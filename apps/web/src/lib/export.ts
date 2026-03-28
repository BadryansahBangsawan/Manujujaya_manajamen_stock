import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import { formatCurrency, formatDateRange, formatNumber } from "./format";

export function downloadExcelReport(payload: Awaited<ReturnType<any>>) {
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      coverage: formatDateRange(payload.summary?.coverageStart, payload.summary?.coverageEnd),
      total_items: payload.summary?.totalItems ?? 0,
      out_of_stock: payload.summary?.totalOutOfStock ?? 0,
      low_stock: payload.summary?.totalLowStock ?? 0,
      fast_moving: payload.summary?.totalFastMoving ?? 0,
      slow_moving: payload.summary?.totalSlowMoving ?? 0,
      dead_moving: payload.summary?.totalDeadMoving ?? 0,
      priority_buy: payload.summary?.totalPriorityBuy ?? 0,
      estimated_restock: payload.summary?.estimatedRestockValue ?? 0,
    },
  ]);

  const purchaseSheet = XLSX.utils.json_to_sheet(
    payload.purchase.map((item: any) => ({
      item_code: item.itemCode,
      item_name: item.itemName,
      stock_status: item.stockStatus,
      movement_class: item.movementClass,
      purchase_priority: item.purchasePriority,
      qty_total: item.qtyTotal,
      current_stock: item.currentStock,
      recommended_order_qty: item.recommendedOrderQty,
      reasons: item.reasons.join(" | "),
    })),
  );

  const slowSheet = XLSX.utils.json_to_sheet(
    payload.slowMoving.map((item: any) => ({
      item_code: item.itemCode,
      item_name: item.itemName,
      movement_class: item.movementClass,
      current_stock: item.currentStock,
      coverage_days: item.coverageDays,
      qty_total: item.qtyTotal,
      reasons: item.reasons.join(" | "),
    })),
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, purchaseSheet, "Prioritas Beli");
  XLSX.utils.book_append_sheet(workbook, slowSheet, "Slow Moving");

  XLSX.writeFile(workbook, "manujujaya-stock-report.xlsx");
}

export function downloadPdfReport(payload: any) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Manujujaya Analytics Report", 14, 20);
  doc.setFontSize(10);
  doc.text(`Coverage: ${formatDateRange(payload.summary?.coverageStart, payload.summary?.coverageEnd)}`, 14, 28);
  doc.text(
    `Estimasi restock: ${formatCurrency(payload.summary?.estimatedRestockValue ?? 0)}`,
    14,
    34,
  );

  autoTable(doc, {
    startY: 42,
    head: [["Metric", "Nilai"]],
    body: [
      ["Total Barang", formatNumber(payload.summary?.totalItems ?? 0)],
      ["Stok Kosong", formatNumber(payload.summary?.totalOutOfStock ?? 0)],
      ["Stok Rendah", formatNumber(payload.summary?.totalLowStock ?? 0)],
      ["Fast Moving", formatNumber(payload.summary?.totalFastMoving ?? 0)],
      ["Slow Moving", formatNumber(payload.summary?.totalSlowMoving ?? 0)],
      ["Dead Moving", formatNumber(payload.summary?.totalDeadMoving ?? 0)],
      ["Prioritas Beli", formatNumber(payload.summary?.totalPriorityBuy ?? 0)],
    ],
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["Barang", "Prioritas", "Saran Beli", "Alasan"]],
    body: payload.purchase.slice(0, 10).map((item: any) => [
      item.itemName,
      item.purchasePriority,
      formatNumber(item.recommendedOrderQty, 0),
      item.reasons.join(" • "),
    ]),
  });

  doc.save("manujujaya-stock-report.pdf");
}
