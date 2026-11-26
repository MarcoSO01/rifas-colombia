"use client";

import { useState } from "react";
import { History, Flame } from "lucide-react";
import type { RaffleSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RaffleCard } from "./raffle-card";

export function RaffleTabs({ active, past }: { active: RaffleSummary[]; past: RaffleSummary[] }) {
  const [tab, setTab] = useState<"active" | "past">("active");
  const list = tab === "active" ? active : past;
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {[
          { id: "active" as const, label: `Activas (${active.length})`, icon: Flame },
          { id: "past" as const, label: `Historial (${past.length})`, icon: History },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === t.id ? "bg-brand-400 text-white shadow-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted-foreground">
          {tab === "active" ? "Pronto publicaremos nuevas rifas. ¡Vuelve pronto!" : "Aún no hay rifas finalizadas."}
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r, i) => <RaffleCard key={r.id} raffle={r} index={i} />)}
        </div>
      )}
    </div>
  );
}
