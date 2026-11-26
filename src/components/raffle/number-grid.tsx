"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Check, Clock, Crown, Lock, Search, Shuffle, Star } from "lucide-react";
import { cn, padNumber } from "@/lib/utils";
import { effectiveStatus } from "@/hooks/use-raffle-tickets";
import type { Ticket, TicketStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const BLOCK = 100;

type CellState = TicketStatus | "selected" | "taken";

interface NumberGridProps {
  total: number;
  tickets: Map<number, Ticket>;
  now: number;
  selected: Set<number>;
  onToggle: (n: number) => void;
  /** IDs de transacciones del usuario actual → resalta "tus números" */
  myTxIds?: Set<string>;
  winnerNumber?: number | null;
  readOnly?: boolean;
  loading?: boolean;
  onRandom?: () => void;
  /** true = muestra el estado real (admin). false = el comprador solo ve libre/ocupado */
  detailed?: boolean;
}

export function NumberGrid({
  total, tickets, now, selected, onToggle, myTxIds, winnerNumber, readOnly, loading, onRandom, detailed = false,
}: NumberGridProps) {
  const blocks = Math.ceil(total / BLOCK);
  const [block, setBlock] = useState(0);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);

  // Buscar un número salta a su bloque y lo resalta
  useEffect(() => {
    const n = Number.parseInt(query, 10);
    if (query === "" || Number.isNaN(n) || n < 0 || n >= total) {
      setHighlight(null);
      return;
    }
    setBlock(Math.floor(n / BLOCK));
    setHighlight(n);
  }, [query, total]);

  const blockCounts = useMemo(() => {
    const counts = new Array(blocks).fill(0);
    tickets.forEach((t) => {
      if (effectiveStatus(t, now) === "available") counts[Math.floor(t.number / BLOCK)]++;
    });
    return counts;
  }, [tickets, now, blocks]);

  const start = block * BLOCK;
  const end = Math.min(start + BLOCK, total);
  const numbers = useMemo(() => Array.from({ length: end - start }, (_, i) => start + i), [start, end]);

  return (
    <div className="space-y-4">
      {/* Herramientas */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            inputMode="numeric"
            placeholder={`Buscar número (0 - ${padNumber(total - 1, total)})`}
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/\D/g, "").slice(0, String(total).length))}
            className="pl-9"
          />
        </div>
        {!readOnly && onRandom && (
          <Button type="button" variant="secondary" onClick={onRandom} className="shrink-0">
            <Shuffle /> <span className="hidden sm:inline">Al azar</span>
          </Button>
        )}
      </div>

      {/* Bloques (para rifas de 1.000 o 10.000 números) */}
      {blocks > 1 && (
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {Array.from({ length: blocks }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setBlock(i)}
              className={cn(
                "snap-start whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-bold tabular-nums transition",
                i === block
                  ? "border-brand-400 bg-brand-400/20 text-brand-100"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08]",
              )}
            >
              {padNumber(i * BLOCK, total)}–{padNumber(Math.min((i + 1) * BLOCK, total) - 1, total)}
              {detailed && <span className="ml-1.5 font-medium text-emerald-300">{blockCounts[i]}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Cuadrícula */}
      <div
        className={cn(
          "grid gap-1.5 sm:gap-2",
          digitsClass(total),
          loading && "pointer-events-none animate-pulse opacity-60",
        )}
        role="group"
        aria-label="Números de la rifa"
      >
        {numbers.map((n) => {
          const t = tickets.get(n);
          const base = t ? effectiveStatus(t, now) : "available";
          const shown: CellState = !detailed && base !== "available" ? "taken" : base;
          const state: CellState = selected.has(n) ? "selected" : shown;
          const mine = Boolean(t?.transaction_id && myTxIds?.has(t.transaction_id) && base !== "available");
          return (
            <NumberCell
              key={n}
              n={n}
              label={padNumber(n, total)}
              state={state}
              mine={mine}
              winner={winnerNumber === n}
              highlight={highlight === n}
              disabled={readOnly || (state !== "available" && state !== "selected")}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}

function digitsClass(total: number) {
  // Más dígitos → celdas más anchas
  if (total > 1000) return "grid-cols-5 sm:grid-cols-8 md:grid-cols-10";
  if (total > 100) return "grid-cols-6 sm:grid-cols-8 md:grid-cols-10";
  return "grid-cols-5 sm:grid-cols-10";
}

const STATE_STYLES: Record<CellState, string> = {
  available:
    "border-white/10 bg-white/[0.05] text-foreground hover:-translate-y-0.5 hover:border-white/70 hover:bg-white/10",
  selected:
    "animate-pop border-brand-300 bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 text-white shadow-brand",
  pending: "stripes cursor-not-allowed border-sky-400/40 bg-sky-500/10 text-sky-200",
  partial: "half-fill cursor-not-allowed border-violet-400/50 text-violet-100",
  paid: "cursor-not-allowed border-white/5 bg-black/40 text-white/25",
  taken: "cursor-not-allowed border-white/5 bg-black/50 text-white/20",
};

const STATE_LABEL: Record<CellState, string> = {
  available: "disponible",
  selected: "seleccionado",
  pending: "en verificación",
  partial: "reservado con abono",
  paid: "vendido",
  taken: "no disponible",
};

const NumberCell = memo(function NumberCell({
  n, label, state, mine, winner, highlight, disabled, onToggle,
}: {
  n: number; label: string; state: CellState; mine: boolean; winner: boolean;
  highlight: boolean; disabled: boolean; onToggle: (n: number) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(n)}
      aria-pressed={state === "selected"}
      aria-label={`Número ${label}, ${STATE_LABEL[state]}${mine ? ", tuyo" : ""}`}
      className={cn(
        "relative flex aspect-square select-none items-center justify-center rounded-xl border font-display text-[15px] font-extrabold tabular-nums transition-all duration-200 sm:text-base",
        STATE_STYLES[state],
        mine && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background",
        highlight && "ring-2 ring-brand-300 ring-offset-2 ring-offset-background",
        winner && "!border-brand-300 !bg-brand-400 !text-white shadow-brand",
      )}
    >
      {label}
      <StateIcon state={state} mine={mine} winner={winner} />
    </button>
  );
});

function StateIcon({ state, mine, winner }: { state: CellState; mine: boolean; winner: boolean }) {
  const cls = "absolute right-0.5 top-0.5 h-3 w-3 sm:right-1 sm:top-1";
  if (winner) return <Crown className={cn(cls, "text-white")} />;
  if (mine) return <Star className={cn(cls, "fill-emerald-400 text-emerald-400")} />;
  if (state === "selected") return <Check className={cn(cls, "text-white")} strokeWidth={3} />;
  if (state === "pending") return <Clock className={cn(cls, "text-sky-300")} />;
  if (state === "paid" || state === "taken") return <Lock className={cn(cls, "text-white/25")} />;
  if (state === "partial")
    return <span className={cn(cls, "grid place-items-center text-[9px] font-black leading-none text-violet-200")}>½</span>;
  return null;
}

export function GridLegend({ detailed = false }: { detailed?: boolean }) {
  const items: { cls: string; label: string }[] = detailed
    ? [
        { cls: "border-white/15 bg-white/[0.06]", label: "Disponible" },
        { cls: "border-brand-300 bg-gradient-to-br from-brand-400 to-brand-700", label: "Seleccionado" },
        { cls: "stripes border-sky-400/40 bg-sky-500/10", label: "En verificación" },
        { cls: "half-fill border-violet-400/50", label: "Con abono" },
        { cls: "border-white/5 bg-black/50", label: "Vendido" },
      ]
    : [
        { cls: "border-white/15 bg-white/[0.06]", label: "Disponible" },
        { cls: "border-brand-300 bg-gradient-to-br from-brand-400 to-brand-700", label: "Tu selección" },
        { cls: "border-white/5 bg-black/50", label: "No disponible" },
      ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-4 w-4 rounded-md border", i.cls)} /> {i.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" /> Tus números
      </li>
    </ul>
  );
}
