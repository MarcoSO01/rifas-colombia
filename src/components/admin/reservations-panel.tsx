"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban, Check, Clock, Coins, ExternalLink, Eye, FileText, Hourglass, Loader2, MessageCircle, RefreshCw, Search, Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PayMethod, RaffleStatus, Transaction, TxStatus } from "@/lib/types";
import { METHOD_LABEL, TX_STATUS_LABEL } from "@/lib/types";
import { cn, formatCOP, formatDate, friendlyError, padNumber, whatsappLink } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Countdown } from "@/components/raffle/countdown";
import { RemindersCard } from "./reminders-card";
import { ReportButton } from "./report-button";

type RaffleLite = { id: string; title: string; total_numbers: number; status: RaffleStatus };
type Row = Transaction & { raffles: { title: string; total_numbers: number } | null };
type Filter = "pending" | "partial" | "approved" | "closed" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Por verificar" },
  { id: "partial", label: "Abonos" },
  { id: "approved", label: "Pagadas" },
  { id: "closed", label: "Rechazadas / vencidas" },
  { id: "all", label: "Todas" },
];

const STATUS_FOR: Record<Filter, TxStatus[] | null> = {
  pending: ["pending"], partial: ["partial"], approved: ["approved"], closed: ["rejected", "expired"], all: null,
};

const VARIANT: Record<TxStatus, BadgeProps["variant"]> = {
  pending: "info", partial: "violet", approved: "success", rejected: "danger", expired: "muted",
};

export function ReservationsPanel({ raffles }: { raffles: RaffleLite[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [raffleId, setRaffleId] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [kpi, setKpi] = useState({ pending: 0, collected: 0, receivable: 0 });
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<{ url: string; pdf: boolean } | null>(null);
  const [abonoTx, setAbonoTx] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("transactions")
      .select("*, raffles(title, total_numbers)")
      .order("created_at", { ascending: filter === "pending" })
      .limit(300);
    if (raffleId !== "all") q = q.eq("raffle_id", raffleId);
    const statuses = STATUS_FOR[filter];
    if (statuses) q = q.in("status", statuses);

    let k = supabase.from("transactions").select("status, amount_total, amount_paid").in("status", ["pending", "partial", "approved"]);
    if (raffleId !== "all") k = k.eq("raffle_id", raffleId);

    const [{ data, error }, { data: kd }] = await Promise.all([q, k]);
    if (error) toast.error(friendlyError(error));
    setRows((data ?? []) as Row[]);
    const agg = { pending: 0, collected: 0, receivable: 0 };
    (kd ?? []).forEach((t) => {
      if (t.status === "pending") agg.pending++;
      agg.collected += Number(t.amount_paid);
      if (t.status !== "approved") agg.receivable += Number(t.amount_total) - Number(t.amount_paid);
    });
    setKpi(agg);
    setLoading(false);
  }, [supabase, raffleId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: llega una reserva nueva → refresca y avisa
  useEffect(() => {
    const ch = supabase
      .channel("admin-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (p) => {
        if (p.eventType === "INSERT") {
          const t = p.new as Transaction;
          if (!t.is_manual) toast.info(`🔔 Nueva reserva ${t.code} · ${t.buyer_name ?? ""}`);
        }
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.buyer_name, r.buyer_email, r.buyer_phone, r.buyer_national_id, ...r.numbers.map((n) => padNumber(n, r.raffles?.total_numbers ?? 100))]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
    if (error || !data) { toast.error("No se pudo abrir el comprobante"); return; }
    setReceipt({ url: data.signedUrl, pdf: path.endsWith(".pdf") });
  };

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(ok);
    load();
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Hourglass} label="Por verificar" value={String(kpi.pending)} cls="text-sky-300" />
        <Kpi icon={Wallet} label="Recaudo confirmado" value={formatCOP(kpi.collected)} cls="text-emerald-300" />
        <Kpi icon={Coins} label="Saldo por cobrar" value={formatCOP(kpi.receivable)} cls="text-violet-300" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <select
            value={raffleId}
            onChange={(e) => setRaffleId(e.target.value)}
            className="h-11 rounded-xl border border-input bg-black/30 px-3 text-sm"
          >
            <option value="all">Todas las rifas</option>
            {raffles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition",
                  filter === f.id ? "bg-brand-400 text-white" : "text-muted-foreground hover:bg-white/5",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Nombre, cédula, celular, código, número" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <ReportButton raffleId={raffleId} />
          <Button variant="outline" size="icon" onClick={load} aria-label="Actualizar">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </CardContent>
      </Card>

      {raffleId !== "all" && <RemindersCard raffleId={raffleId} />}

      {/* Listado */}
      {loading && !rows.length ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-8 w-8 animate-spin text-brand-300" /></div>
      ) : filtered.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted-foreground">No hay reservas en esta vista. ✨</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((r) => (
            <ReservationCard
              key={r.id}
              tx={r}
              onReceipt={openReceipt}
              onApprove={() => run("admin_approve", { p_tx: r.id }, `Pago ${r.code} aprobado ✅`)}
              onAbono={() => setAbonoTx(r)}
              onReject={() => {
                const reason = prompt("Motivo del rechazo (se le mostrará al usuario):", "Pago no recibido");
                if (reason !== null) run("admin_reject", { p_tx: r.id, p_reason: reason || null }, `Números de ${r.code} liberados`);
              }}
              onExtend={() => run("admin_extend", { p_tx: r.id, p_minutes: 30 }, "Reserva extendida 30 minutos")}
            />
          ))}
        </div>
      )}

      {/* Visor de comprobante */}
      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Comprobante</DialogTitle></DialogHeader>
          {receipt &&
            (receipt.pdf ? (
              <iframe src={receipt.url} className="h-[70dvh] w-full rounded-xl bg-white" title="Comprobante PDF" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receipt.url} alt="Comprobante de pago" className="mx-auto max-h-[70dvh] rounded-xl object-contain" />
            ))}
          {receipt && (
            <Button asChild variant="outline" className="mt-3 w-full">
              <a href={receipt.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir en otra pestaña</a>
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <AbonoDialog tx={abonoTx} onClose={() => setAbonoTx(null)} onDone={load} />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, cls }: { icon: typeof Wallet; label: string; value: string; cls: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className={cn("h-4 w-4", cls)} /> {label}</p>
      <p className={cn("mt-1 font-display text-2xl font-black", cls)}>{value}</p>
    </div>
  );
}

function ReservationCard({
  tx, onReceipt, onApprove, onAbono, onReject, onExtend,
}: {
  tx: Row; onReceipt: (p: string) => void; onApprove: () => Promise<void> | void; onAbono: () => void;
  onReject: () => void; onExtend: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = (key: string, fn: () => Promise<void> | void) => async () => {
    setBusy(key);
    await fn();
    setBusy(null);
  };
  const total = tx.raffles?.total_numbers ?? 100;
  const actionable = tx.status === "pending" || tx.status === "partial";
  const balance = tx.amount_total - tx.amount_paid;

  return (
    <div className={cn("glass animate-float-up rounded-2xl p-4", tx.status === "pending" && "border-sky-400/30")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{tx.buyer_name ?? "Sin nombre"} {tx.is_manual && <Badge variant="muted" className="ml-1">Manual</Badge>}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tx.buyer_national_id ? `C.C. ${tx.buyer_national_id}` : "Sin cédula"}{tx.buyer_email ? ` · ${tx.buyer_email}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={VARIANT[tx.status]}>{TX_STATUS_LABEL[tx.status]}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{tx.code}</span>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{tx.raffles?.title} · Comprado el {formatDate(tx.created_at)}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tx.numbers.map((n) => (
          <span key={n} className="rounded-lg bg-brand-400/15 px-2 py-0.5 font-display font-black text-brand-100 ring-1 ring-brand-400/30">
            {padNumber(n, total)}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-3 text-xs sm:grid-cols-4">
        <div><p className="text-muted-foreground">Medio</p><p className="font-semibold">{METHOD_LABEL[tx.method]}</p></div>
        <div><p className="text-muted-foreground">Total</p><p className="font-semibold">{formatCOP(tx.amount_total)}</p></div>
        <div>
          <p className="text-muted-foreground">{tx.plan === "partial" ? "Abono declarado" : "Declarado"}</p>
          <p className="font-semibold text-sky-200">{formatCOP(tx.amount_declared)}</p>
        </div>
        <div><p className="text-muted-foreground">Confirmado</p><p className="font-semibold text-emerald-300">{formatCOP(tx.amount_paid)}</p></div>
      </div>
      {balance > 0 && tx.status === "partial" && (
        <p className="mt-2 text-xs text-violet-200">Saldo pendiente: <b>{formatCOP(balance)}</b></p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {tx.buyer_phone && (
          <a
            href={whatsappLink(tx.buyer_phone, `Hola ${tx.buyer_name ?? ""}, te escribimos por tu reserva ${tx.code}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-200 hover:bg-emerald-500/25"
          >
            <MessageCircle className="h-3.5 w-3.5" /> {tx.buyer_phone}
          </a>
        )}
        {tx.receipt_path ? (
          <button onClick={() => onReceipt(tx.receipt_path!)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/15">
            {tx.receipt_path.endsWith(".pdf") ? <FileText className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Ver comprobante
          </button>
        ) : (
          <span className="text-muted-foreground">Sin comprobante</span>
        )}
        {tx.status === "pending" && tx.expires_at && (
          <span className="ml-auto inline-flex items-center gap-1 text-sky-200">
            <Clock className="h-3.5 w-3.5" /> <Countdown to={tx.expires_at} />
          </span>
        )}
      </div>

      {tx.admin_note && <p className="mt-2 text-xs italic text-muted-foreground">“{tx.admin_note}”</p>}

      {actionable && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="sm" variant="secondary" onClick={wrap("ok", onApprove)} disabled={!!busy} className="col-span-2 sm:col-span-1">
            {busy === "ok" ? <Loader2 className="animate-spin" /> : <Check />} Aprobar pago
          </Button>
          <Button size="sm" variant="outline" onClick={onAbono} disabled={!!busy} className="border-violet-400/40 text-violet-100">
            <Coins /> Abono
          </Button>
          {tx.status === "pending" ? (
            <Button size="sm" variant="outline" onClick={wrap("ext", onExtend)} disabled={!!busy}>
              {busy === "ext" ? <Loader2 className="animate-spin" /> : <Clock />} +30 min
            </Button>
          ) : <span className="hidden sm:block" />}
          <Button size="sm" variant="destructive" onClick={onReject} disabled={!!busy}>
            <Ban /> Liberar
          </Button>
        </div>
      )}
    </div>
  );
}

function AbonoDialog({ tx, onClose, onDone }: { tx: Row | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tx) {
      const suggested = tx.amount_paid > 0 ? tx.amount_total - tx.amount_paid : tx.amount_declared;
      setAmount(String(Math.max(suggested, 0)));
      setMethod(tx.method);
      setNote("");
    }
  }, [tx]);

  if (!tx) return null;
  const value = Number(amount.replace(/\D/g, "")) || 0;
  const remaining = tx.amount_total - tx.amount_paid;

  const save = async () => {
    if (value <= 0) { toast.error("Escribe el monto recibido."); return; }
    setSaving(true);
    const { error } = await createClient().rpc("admin_register_payment", {
      p_tx: tx.id, p_amount: value, p_method: method, p_note: note || null,
    });
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(value >= remaining ? "Pago completado ✅" : "Abono registrado");
    onClose();
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar abono · {tx.code}</DialogTitle>
          <DialogDescription>
            Total {formatCOP(tx.amount_total)} · confirmado {formatCOP(tx.amount_paid)} · saldo {formatCOP(remaining)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="monto">Monto recibido</Label>
            <Input id="monto" inputMode="numeric" value={value ? value.toLocaleString("es-CO") : ""} onChange={(e) => setAmount(e.target.value)} />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAmount(String(tx.amount_declared))}>Declarado</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAmount(String(remaining))}>Saldo completo</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="medio">Medio</Label>
            <select id="medio" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nota">Nota (opcional)</Label>
            <Input id="nota" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. recibido en tienda" />
          </div>
          <p className="text-xs text-muted-foreground">
            {value >= remaining ? "✅ Con este monto la boleta queda PAGADA." : "Los números quedarán como “Reservado con abono”."}
          </p>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Coins />} Guardar abono
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
