import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Descarga el reporte Excel (ventas, abonos con cuotas, números y resumen) */
export function ReportButton({ raffleId = "all", label = "Descargar Excel" }: { raffleId?: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/admin/report?raffleId=${raffleId}`} download>
        <FileSpreadsheet className="text-emerald-400" /> {label}
      </a>
    </Button>
  );
}
