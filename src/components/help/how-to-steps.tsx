import { CheckCircle2, Hand, Receipt, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Hand, title: "Elige tus números", text: "Toca los números que quieras. Puedes usar “Al azar”." },
  { icon: UserRound, title: "Escribe tus datos", text: "Nombre, cédula y celular. No necesitas crear cuenta." },
  { icon: Receipt, title: "Paga y envía el comprobante", text: "Nequi, Daviplata, Bre-B, Bancolombia o efectivo. Puedes abonar." },
  { icon: CheckCircle2, title: "Recibe tu confirmación", text: "Te llega por WhatsApp y la consultas cuando quieras." },
];

export function HowToSteps({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <ol className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4", className)}>
      {STEPS.map((s, i) => (
        <li key={s.title} className={cn("glass relative rounded-2xl", compact ? "p-3" : "p-5")}>
          <span className="absolute right-3 top-2 font-display text-3xl font-black italic text-white/10">{i + 1}</span>
          <s.icon className={cn("text-brand-500", compact ? "mb-1.5 h-5 w-5" : "mb-3 h-7 w-7")} />
          <p className={cn("font-display font-bold", compact ? "text-sm leading-tight" : "text-lg")}>{s.title}</p>
          {!compact && <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>}
        </li>
      ))}
    </ol>
  );
}
