import { Badge } from "@Manujujaya-Manajemen-stock/ui/components/badge";
import { useLanguage } from "./language-provider";

export function StockStatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();

  const normalized =
    status === "Out of Stock" ? "Kosong" : status === "Low" ? "Rendah" : status === "Safe" ? "Aman" : status;
  const variant =
    normalized === "Kosong" ? "danger" : normalized === "Rendah" ? "warning" : "success";

  const label =
    language === "id"
      ? normalized === "Kosong"
        ? "Kosong"
        : normalized === "Rendah"
          ? "Rendah"
          : "Aman"
      : normalized === "Kosong"
        ? "Out of Stock"
        : normalized === "Rendah"
          ? "Low Stock"
          : "Safe";

  return <Badge variant={variant}>{label}</Badge>;
}

export function MovementBadge({
  movement,
}: {
  movement: string;
}) {
  const { language } = useLanguage();

  const normalized =
    movement === "Cepat Bergerak" || movement === "Cepat Terjual" || movement === "Fast Selling"
      ? "Fast Moving"
      : movement === "Sedang Bergerak" || movement === "Sedang Terjual" || movement === "Medium Selling"
        ? "Medium Moving"
        : movement === "Lambat Bergerak" || movement === "Lambat Terjual" || movement === "Slow Selling"
          ? "Slow Moving"
          : movement === "Tidak Bergerak" || movement === "Tidak Terjual" || movement === "Not Selling"
            ? "Dead Moving"
            : movement;
  const variant =
    normalized === "Fast Moving"
      ? "success"
      : normalized === "Medium Moving"
        ? "default"
        : normalized === "Dead Moving"
          ? "danger"
          : "warning";

  const label =
    language === "id"
      ? normalized === "Fast Moving"
        ? "Cepat Terjual"
        : normalized === "Medium Moving"
          ? "Sedang Terjual"
          : normalized === "Dead Moving"
            ? "Tidak Terjual"
            : "Lambat Terjual"
      : normalized === "Fast Moving"
        ? "Fast Selling"
        : normalized === "Medium Moving"
          ? "Medium Selling"
          : normalized === "Dead Moving"
            ? "Not Selling"
            : "Slow Selling";

  return <Badge variant={variant}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { language } = useLanguage();

  const normalized =
    priority === "Tinggi" ? "High" : priority === "Sedang" ? "Medium" : priority === "Rendah" ? "Low" : priority;
  const variant =
    normalized === "High" ? "danger" : normalized === "Medium" ? "warning" : "secondary";

  const label =
    language === "id"
      ? normalized === "High"
        ? "Tinggi"
        : normalized === "Medium"
          ? "Sedang"
          : "Rendah"
      : normalized;

  return <Badge variant={variant}>{label}</Badge>;
}
