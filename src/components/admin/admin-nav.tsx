"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, LayoutTemplate, Landmark, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Reservas", icon: ClipboardCheck, exact: true },
  { href: "/admin/rifas", label: "Rifas", icon: Ticket },
  { href: "/admin/pagos", label: "Medios de pago", icon: Landmark },
  { href: "/admin/contenido", label: "Contenido", icon: LayoutTemplate },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
              active ? "bg-brand-400 text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <l.icon className="h-4 w-4" /> <span className="hidden sm:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
