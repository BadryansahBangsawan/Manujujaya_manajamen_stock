export function formatNumber(value: number | null | undefined, digits = 0) {
  const safe = value ?? 0;
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(safe);
}

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "Belum ada data aktif";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "Belum ada data aktif";
}

export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
