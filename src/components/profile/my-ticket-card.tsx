"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TransactionWithRaffle, TxStatus } from "@/lib/types";
import { METHOD_LABEL, TX_STATUS_LABEL } from "@/lib/types";
import { formatCOP, formatDate, friendlyError, padNumber } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/raffle/countdown";

const VARIANT: Record<TxStatus, BadgeProps["variant"]> = {
  pending: "info", partial: "violet", approved: "success", rejected: "danger", expired: "muted",
};

export function MyTicketCard({ tx }: { tx: TransactionWithRaffle }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const total = tx.raffles?.total_numbers ?? 100;
  const won = tx.raffles?.winner_number != null && tx.status === "approved" && tx.numbers.includes(tx.raffles.winner_number);
  const balance = tx.amount_total - tx.amount_paid;

  const cancel = async () => {
    if (!confirm("¿Cancelar esta reserva y liberar los números?")) return;
    setBusy(true);
    const { error } = await createClient().rpc("cancel_my_order", { p_tx: tx.id });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Reserva cancelada");
    router.refresh();
  };

  return (
    <div className={`glass rounded-2xl p-4 ${won ? "border-gold-400/60 shadow-gold" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/rifas/${tx.raffles?.slug ?? ""}`} className="font-bold hover:text-gold-200">{tx.raffles?.title}</Link>
          <p className="text-xs text-muted-foreground">
            Código <span className="font-mono text-foreground">{tx.code}</span> · {formatDate(tx.created_at)}
          </p>
        </div>
        <Badge variant={VARIANT[tx.status]}>{TX_STATUS_LABEL[tx.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tx.numbers.map((n) => (
          <span
            key={n}
            className={`rounded-lg px-2 py-0.5 font-display font-black ${
              n === tx.raffles?.winner_number ? "bg-gold-400 text-emerald-950" : "bg-white/10"
            }`}
          >
            {padNumber(n, total)}
          </span>
        ))}
      </div>

      {won && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-gold-400/15 p-3 font-bold text-gold-100">
          <Crown className="h-5 w-5" /> ¡Felicitaciones, ganaste! El organizador te contactará.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-muted-foreground">Total</p><p className="font-bold">{formatCOP(tx.amount_total)}</p></div>
        <div><p className="text-muted-foreground">Pagado</p><p className="font-bold text-emerald-300">{formatCOP(tx.amount_paid)}</p></div>
        <div><p className="text-muted-foreground">Saldo</p><p className={`font-bold ${balance > 0 ? "text-violet-200" : ""}`}>{formatCOP(balance)}</p></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{METHOD_LABEL[tx.method]}{tx.plan === "partial" ? ` · abono declarado ${formatCOP(tx.amount_declared)}` : ""}</span>
        {tx.status === "pending" && (
          <span className="flex items-center gap-2">
            Vence en <Countdown to={tx.expires_at} className="text-sky-200" />
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <XCircle />} Cancelar
            </Button>
          </span>
        )}
      </div>
      {tx.admin_note && ["rejected", "expired"].includes(tx.status) && (
        <p className="mt-2 text-xs text-rose-200/80">Nota: {tx.admin_note}</p>
      )}
    </div>
  );
}
