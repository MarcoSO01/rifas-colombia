import { CircleDot, Clock, Ticket, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function RaffleStats({
  total, available, pending, partial, paid, live,
}: {
  total: number; available: number; pending: number; partial: number; paid: number; live?: boolean;
}) {
  const progress = total ? ((paid + partial) / total) * 100 : 0;
  const stats = [
    { icon: CircleDot, label: "Disponibles", value: available, color: "text-emerald-300" },
    { icon: Ticket, label: "Vendidos", value: paid, color: "text-brand-300" },
    { icon: Clock, label: "En verificación", value: pending, color: "text-sky-300" },
    { icon: TrendingUp, label: "Con abono", value: partial, color: "text-violet-300" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} /> {s.label}
            </div>
            <div className={`mt-1 font-display text-2xl font-black tabular-nums transition-all ${s.color}`}>
              {s.value.toLocaleString("es-CO")}
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {live !== undefined && (
              <span className={`h-2 w-2 rounded-full ${live ? "animate-glow bg-emerald-400" : "bg-white/30"}`} />
            )}
            {live ? "En vivo" : "Progreso de la rifa"}
          </span>
          <span className="font-bold text-brand-200">{progress.toFixed(1)}% vendido</span>
        </div>
        <Progress value={progress} />
      </div>
    </div>
  );
}
