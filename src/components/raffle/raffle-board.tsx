"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Trash2, X } from "lucide-react";
import type { MediaKind, PaymentMethod, Raffle } from "@/lib/types";
import { cn, formatCOP, padNumber } from "@/lib/utils";
import { effectiveStatus, useNow, useRaffleTickets } from "@/hooks/use-raffle-tickets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GridLegend, NumberGrid } from "./number-grid";
import { HowToSteps } from "@/components/help/how-to-steps";
import { HowToVideoButton } from "@/components/help/howto-video-button";
import { CheckoutDialog, type CreatedOrder } from "@/components/checkout/checkout-dialog";

const MY_TX_KEY = "rifa:myTx";

interface Props {
  raffle: Raffle;
  paymentMethods: PaymentMethod[];
  ownerWhatsapp: string | null;
  howto?: { url: string; kind: MediaKind; title: string } | null;
}

export function RaffleBoard({ raffle, paymentMethods, ownerWhatsapp, howto }: Props) {
  const now = useNow(1000);
  const { tickets, loading, live, refresh, onChange } = useRaffleTickets(raffle.id);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Las compras hechas desde este celular se recuerdan localmente (sin cuenta)
  const [myTxIds, setMyTxIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setMyTxIds(new Set(JSON.parse(localStorage.getItem(MY_TX_KEY) ?? "[]") as string[]));
    } catch {}
  }, []);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const checkoutOpenRef = useRef(false);
  checkoutOpenRef.current = checkoutOpen;
  const storageKey = `rifa:sel:${raffle.id}`;

  const salesOpen =
    raffle.status === "published" && (!raffle.draw_date || new Date(raffle.draw_date).getTime() > now);

  // Restaura la selección si recarga la página
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as number[];
      if (saved.length) setSelected(new Set(saved));
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...selected]));
    } catch {}
  }, [selected, storageKey]);

  // Si otra persona aparta un número que tengo seleccionado, lo quito y aviso
  useEffect(
    () =>
      onChange((t) => {
        // Mientras el checkout está abierto, los cambios pueden ser de mi propia orden
        if (t.status === "available" || checkoutOpenRef.current) return;
        setSelected((prev) => {
          if (!prev.has(t.number)) return prev;
          if (t.transaction_id && myTxIds.has(t.transaction_id)) return prev;
          toast.warning(`¡Uy! El número ${padNumber(t.number, raffle.total_numbers)} acaba de ser apartado.`);
          const next = new Set(prev);
          next.delete(t.number);
          return next;
        });
      }),
    [onChange, raffle.total_numbers, myTxIds],
  );

  // Limpia de la selección restaurada los números que ya no están libres
  useEffect(() => {
    if (loading) return;
    setSelected((prev) => {
      const next = new Set([...prev].filter((n) => {
        const t = tickets.get(n);
        return t && effectiveStatus(t, Date.now()) === "available";
      }));
      return next.size === prev.size ? prev : next;
    });
  }, [loading, tickets]);

  const toggle = useCallback(
    (n: number) => {
      if (!salesOpen) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(n)) next.delete(n);
        else {
          if (next.size >= raffle.max_numbers_per_order) {
            toast.info(`Máximo ${raffle.max_numbers_per_order} números por compra.`);
            return prev;
          }
          next.add(n);
          navigator.vibrate?.(12);
        }
        return next;
      });
    },
    [salesOpen, raffle.max_numbers_per_order],
  );

  const pickRandom = useCallback(() => {
    const pool: number[] = [];
    tickets.forEach((t) => {
      if (effectiveStatus(t, Date.now()) === "available" && !selected.has(t.number)) pool.push(t.number);
    });
    if (!pool.length) { toast.info("No quedan números disponibles."); return; }
    const n = pool[Math.floor(Math.random() * pool.length)];
    toggle(n);
    toast.success(`🍀 Tu número de la suerte: ${padNumber(n, raffle.total_numbers)}`);
  }, [tickets, selected, toggle, raffle.total_numbers]);

  const proceed = () => setCheckoutOpen(true);

  const handleSuccess = (tx: CreatedOrder) => {
    setMyTxIds((prev) => {
      const next = new Set(prev).add(tx.id);
      try {
        localStorage.setItem(MY_TX_KEY, JSON.stringify([...next].slice(-100)));
      } catch {}
      return next;
    });
    setSelected(new Set());
    refresh();
  };

  const sortedSelection = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const total = sortedSelection.length * raffle.ticket_price;

  return (
    <>
      <div className="space-y-5">
        {/* Guía rápida (sin estadísticas: eso solo lo ve el administrador) */}
        {salesOpen && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-black italic">¿Cómo comprar?</h2>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${live ? "animate-glow bg-emerald-400" : "bg-white/30"}`} /> En vivo
                </span>
                {howto && <HowToVideoButton {...howto} />}
              </div>
            </div>
            <HowToSteps compact />
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {!salesOpen && (
              <p className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-center text-sm text-sky-100">
                {raffle.status === "finished"
                  ? "Esta rifa ya finalizó."
                  : raffle.status === "paused"
                    ? "La venta está pausada temporalmente."
                    : "La venta de números está cerrada."}
              </p>
            )}
            <NumberGrid
              total={raffle.total_numbers}
              tickets={tickets}
              now={now}
              selected={selected}
              onToggle={toggle}
              myTxIds={myTxIds}
              winnerNumber={raffle.winner_number}
              readOnly={!salesOpen}
              loading={loading}
              onRandom={salesOpen ? pickRandom : undefined}
            />
            <GridLegend />
          </CardContent>
        </Card>
      </div>

      {/* Barra fija de compra */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-brand-400/20 bg-background/90 backdrop-blur-xl transition-transform duration-300",
          selected.size ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="container flex items-center gap-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {sortedSelection.map((n) => (
                <button
                  key={n}
                  onClick={() => toggle(n)}
                  className="flex shrink-0 items-center gap-0.5 rounded-lg bg-brand-400 px-2 py-0.5 font-display text-sm font-black text-white"
                >
                  {padNumber(n, raffle.total_numbers)} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selected.size} {selected.size === 1 ? "número" : "números"} ·{" "}
              <span className="font-bold text-brand-200">{formatCOP(total)}</span>
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} aria-label="Limpiar selección">
            <Trash2 />
          </Button>
          <Button size="lg" onClick={proceed} className="px-5">
            Apartar <ArrowRight />
          </Button>
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        raffle={raffle}
        numbers={sortedSelection}
        paymentMethods={paymentMethods}
        ownerWhatsapp={ownerWhatsapp}
        onSuccess={handleSuccess}
        onConflict={refresh}
      />
    </>
  );
}
