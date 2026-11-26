"use client";

import { useMemo } from "react";
import { effectiveStatus, useNow, useRaffleTickets } from "@/hooks/use-raffle-tickets";
import { RaffleStats } from "@/components/raffle/raffle-stats";

/** Disponibles / vendidos / en verificación / con abono en tiempo real (solo admin) */
export function AdminLiveStats({ raffleId, total }: { raffleId: string; total: number }) {
  const now = useNow(5000);
  const { tickets, live } = useRaffleTickets(raffleId);
  const stats = useMemo(() => {
    const s = { available: 0, pending: 0, partial: 0, paid: 0 };
    tickets.forEach((t) => {
      s[effectiveStatus(t, now)]++;
    });
    return s;
  }, [tickets, now]);
  return <RaffleStats total={total} live={live} {...stats} />;
}
