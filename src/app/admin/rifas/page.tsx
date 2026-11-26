import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { RaffleSummary } from "@/lib/types";
import { RAFFLE_STATUS_LABEL } from "@/lib/types";
import { formatCOP, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Admin · Rifas" };

export default async function AdminRafflesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("raffle_summary").select("*").order("created_at", { ascending: false });
  const raffles = (data ?? []) as RaffleSummary[];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild><Link href="/admin/rifas/nueva"><Plus /> Nueva rifa</Link></Button>
      </div>
      {raffles.length === 0 && <p className="glass rounded-2xl p-10 text-center text-muted-foreground">Crea tu primera rifa 🎉</p>}
      <div className="grid gap-3">
        {raffles.map((r) => {
          const sold = r.paid_count + r.partial_count;
          const revenue = r.paid_count * r.ticket_price;
          return (
            <div key={r.id} className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "published" ? "success" : r.status === "finished" ? "muted" : "info"}>
                    {RAFFLE_STATUS_LABEL[r.status]}
                  </Badge>
                  <span className="truncate font-bold">{r.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCOP(r.ticket_price)} · {r.total_numbers} números · Sorteo {formatDate(r.draw_date)}
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <Progress value={(sold / r.total_numbers) * 100} className="h-2 max-w-xs" />
                  <span className="whitespace-nowrap text-xs">
                    <b className="text-brand-200">{r.paid_count}</b> pagados · <b className="text-violet-200">{r.partial_count}</b> abonos ·{" "}
                    <b className="text-sky-200">{r.pending_count}</b> por verificar
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">Vendido (pagados)</p>
                  <p className="font-display text-lg font-black text-emerald-300">{formatCOP(revenue)}</p>
                </div>
                <Button asChild variant="outline" size="sm"><Link href={`/admin/rifas/${r.id}`}><Pencil /> Gestionar</Link></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
