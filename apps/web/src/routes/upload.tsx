import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { UploadWorkbench } from "@/components/upload-workbench";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { useLanguage } from "@/components/language-provider";

export const Route = createFileRoute("/upload")({
  component: UploadPage,
});

function UploadPage() {
  const { language } = useLanguage();
  const isId = language === "id";
  const revealRef = useGsapReveal<HTMLDivElement>();

  return (
    <div ref={revealRef} className="space-y-8">
      <PageHeader
        eyebrow={isId ? "Upload Data" : "Upload Data"}
        title={
          isId
            ? "Masukkan master barang dan file penjualan tanpa memaksa format tunggal"
            : "Import master inventory and sales files without forcing a single format"
        }
        description={
          isId
            ? "Sistem membaca file Excel/CSV, menebak tipe dataset, memberi preset mapping dari header yang dikenal, lalu menyimpan batch ke histori upload."
            : "The system parses Excel/CSV files, detects dataset type, applies known header mapping presets, then stores the batch in upload history."
        }
      />

      <div className="grid gap-6">
        <UploadWorkbench
          datasetType="master"
          title={isId ? "Upload master seluruh data barang" : "Upload master inventory data"}
          description={
            isId
              ? "Gunakan file master untuk menyegarkan stok, minimum stock, base price, dan atribut barang yang dipakai seluruh dashboard."
              : "Use master files to refresh stock, minimum stock, base price, and item attributes used across the dashboard."
          }
        />
        <UploadWorkbench
          datasetType="sales"
          title={isId ? "Upload data penjualan / barang yang laku" : "Upload sales / top-selling data"}
          description={
            isId
              ? "Dukung dua mode: transaksi item-per-baris atau rekap penjualan per produk. Untuk report summary, coverage period bisa dikoreksi sebelum commit."
              : "Supports two modes: transaction item-per-row or product sales summary. For summary reports, coverage period can be corrected before commit."
          }
        />
      </div>
    </div>
  );
}
