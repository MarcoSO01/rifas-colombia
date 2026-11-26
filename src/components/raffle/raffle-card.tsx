import Link from "next/link";
import { ArrowRight, CalendarDays, Crown, Gift } from "lucide-react";
import type { RaffleSummary } from "@/lib/types";
import { RAFFLE_STATUS_LABEL } from "@/lib/types";
import { formatCOP, formatDate, padNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function RaffleCard({ raffle, index = 0 }: { raffle: RaffleSummary; index?: number }) {
  const finished = raffle.status === "finished";

  return (
    <Link
      href={`/rifas/${raffle.slug}`}
      className="group glass block animate-float-up overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-brand"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-zinc-900 to-black">
        {raffle.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={raffle.image_url} alt={raffle.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center"><Gift className="h-16 w-16 text-brand-400/60" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge variant={finished ? "muted" : raffle.status === "paused" ? "info" : "success"}>
            {RAFFLE_STATUS_LABEL[raffle.status]}
          </Badge>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="line-clamp-1 text-xs font-medium uppercase tracking-wider text-brand-200">{raffle.prize}</p>
          <h3 className="line-clamp-2 font-display text-xl font-black leading-tight">{raffle.title}</h3>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Boleta</p>
            <p className="font-display text-2xl font-black text-gradient">{formatCOP(raffle.ticket_price)}</p>
          </div>
          {finished && raffle.winner_number !== null ? (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Ganador</p>
              <p className="flex items-center gap-1 font-display text-2xl font-black text-brand-300">
                <Crown className="h-5 w-5" /> {padNumber(raffle.winner_number, raffle.total_numbers)}
              </p>
            </div>
          ) : raffle.status === "published" ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-b from-brand-500 to-brand-700 px-3 py-2 text-sm font-bold text-white shadow-brand transition group-hover:brightness-110">
              Participar <ArrowRight className="h-4 w-4" />
            </span>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(raffle.draw_date)}
        </p>
      </div>
    </Link>
  );
}
