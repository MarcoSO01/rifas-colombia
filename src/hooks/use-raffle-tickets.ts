"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Ticket, TicketStatus } from "@/lib/types";

const PAGE = 1000; // límite por request de la API de Supabase

/** Reloj compartido para temporizadores (re-render cada `ms`) */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Estado efectivo: una reserva pendiente vencida se muestra como disponible */
export function effectiveStatus(t: Ticket, now: number): TicketStatus {
  if (t.status === "pending" && t.held_until && new Date(t.held_until).getTime() < now) return "available";
  return t.status;
}

/**
 * Carga TODOS los números de una rifa (paginando de 1000 en 1000)
 * y se suscribe a Supabase Realtime para actualizar la cuadrícula al instante.
 */
export function useRaffleTickets(raffleId: string, initial: Ticket[] = []) {
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<Map<number, Ticket>>(
    () => new Map(initial.map((t) => [t.number, t])),
  );
  const [loading, setLoading] = useState(initial.length === 0);
  const [live, setLive] = useState(false);
  const listeners = useRef(new Set<(t: Ticket) => void>());
  // Nombre único por instancia: varias cuadrículas de la misma rifa pueden convivir en una página
  const channelName = useMemo(() => `tickets:${raffleId}:${Math.random().toString(36).slice(2, 8)}`, [raffleId]);

  const fetchAll = useCallback(async () => {
    // Libera reservas vencidas antes de leer (además del pg_cron cada minuto)
    await supabase.rpc("release_expired_holds");
    const all: Ticket[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, raffle_id, number, status, transaction_id, held_until")
        .eq("raffle_id", raffleId)
        .order("number")
        .range(from, from + PAGE - 1);
      if (error) break;
      all.push(...(data as Ticket[]));
      if (!data || data.length < PAGE) break;
    }
    setTickets(new Map(all.map((t) => [t.number, t])));
    setLoading(false);
  }, [raffleId, supabase]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `raffle_id=eq.${raffleId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Ticket;
          if (!row || typeof row.number !== "number") return;
          if (payload.eventType === "DELETE") {
            setTickets((prev) => {
              const next = new Map(prev);
              next.delete(row.number);
              return next;
            });
            return;
          }
          setTickets((prev) => new Map(prev).set(row.number, row));
          listeners.current.forEach((fn) => fn(row));
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        // Al reconectar (ej. el celular salió de suspensión) re-sincroniza
        if (status === "SUBSCRIBED") fetchAll();
      });

    const onVisible = () => document.visibilityState === "visible" && fetchAll();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [raffleId, supabase, fetchAll, channelName]);

  const onChange = useCallback((fn: (t: Ticket) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return { tickets, loading, live, refresh: fetchAll, onChange };
}
