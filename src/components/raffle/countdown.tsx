"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Cuenta regresiva: variante "big" para el sorteo, "inline" para reservas */
export function Countdown({
  to, variant = "inline", className, expiredLabel = "Vencido",
}: {
  to: string | null; variant?: "big" | "inline"; className?: string; expiredLabel?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!to) return null;
  if (now === null) return <span className={className}>…</span>; // evita mismatch de hidratación
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span className={cn("font-semibold text-rose-300", className)}>{expiredLabel}</span>;
  const { d, h, m, s } = parts(diff);
  const pad = (v: number) => String(v).padStart(2, "0");

  if (variant === "inline") {
    return (
      <span className={cn("font-mono font-bold tabular-nums", diff < 5 * 60_000 && "text-rose-300", className)}>
        {d > 0 && `${d}d `}{pad(h)}:{pad(m)}:{pad(s)}
      </span>
    );
  }
  return (
    <div className={cn("flex gap-2", className)}>
      {[{ v: d, l: "días" }, { v: h, l: "horas" }, { v: m, l: "min" }, { v: s, l: "seg" }].map((x) => (
        <div key={x.l} className="glass min-w-[60px] rounded-xl px-2 py-2 text-center">
          <div className="font-display text-2xl font-black tabular-nums text-gradient">{pad(x.v)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{x.l}</div>
        </div>
      ))}
    </div>
  );
}
