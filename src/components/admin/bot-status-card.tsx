"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, RotateCcw, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BotStatus { state: string; last_seen: string | null; phone: string | null; info: string | null }
interface Failed { id: number; phone: string; kind: string; error: string | null; created_at: string }

const KIND: Record<string, string> = {
  purchase_buyer: "Confirmación", purchase_owner: "Aviso al dueño", payment_reminder: "Recordatorio de pago", draw_reminder: "Recordatorio de sorteo", manual: "Manual",
};

/** Estado del bot de WhatsApp (programa en tu PC) y su bandeja de salida */
export function BotStatusCard() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [counts, setCounts] = useState({ queued: 0, sentToday: 0, failed: 0 });
  const [failed, setFailed] = useState<Failed[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ data: st }, q, s, f] = await Promise.all([
      supabase.from("bot_status").select("state, last_seen, phone, info").eq("id", 1).maybeSingle(),
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).in("status", ["queued", "sending"]),
      supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", today.toISOString()),
      supabase.from("whatsapp_outbox").select("id, phone, kind, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
    ]);
    setStatus(st as BotStatus | null);
    setCounts({ queued: q.count ?? 0, sentToday: s.count ?? 0, failed: (f.data ?? []).length });
    setFailed((f.data ?? []) as Failed[]);
    setNow(Date.now());
  }, [supabase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const online = status?.last_seen && now - new Date(status.last_seen).getTime() < 90_000;
  const view = !status?.last_seen || !online
    ? { label: "Apagado", cls: "bg-white/30", text: "Abre “iniciar-bot” en tu PC para que se envíen los mensajes." }
    : status.state === "ready"
      ? { label: "Conectado", cls: "bg-emerald-400 animate-glow", text: `Enviando desde ${status.phone ?? "tu WhatsApp"}.` }
      : status.state === "qr"
        ? { label: "Esperando escaneo", cls: "bg-amber-400 animate-glow", text: "Escanea el código QR que aparece en la ventana del bot (WhatsApp → Dispositivos vinculados)." }
        : { label: "Desconectado", cls: "bg-rose-500", text: status.info ?? "WhatsApp cerró la sesión. Reinicia el bot." };

  const retry = async () => {
    setBusy(true);
    const { error } = await supabase.from("whatsapp_outbox").update({ status: "queued", error: null }).eq("status", "failed");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mensajes fallidos puestos en cola otra vez");
    load();
  };

  const cancel = async (id: number) => {
    await supabase.from("whatsapp_outbox").update({ status: "cancelled" }).eq("id", id);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-brand-500" /> Bot de WhatsApp</CardTitle>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("h-2.5 w-2.5 rounded-full", view.cls)} /> {view.label}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{view.text}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/30 p-2"><p className="font-display text-xl font-black text-sky-300">{counts.queued}</p><p className="text-[11px] text-muted-foreground">En cola</p></div>
          <div className="rounded-xl bg-black/30 p-2"><p className="font-display text-xl font-black text-emerald-300">{counts.sentToday}</p><p className="text-[11px] text-muted-foreground">Enviados hoy</p></div>
          <div className="rounded-xl bg-black/30 p-2"><p className="font-display text-xl font-black text-rose-300">{counts.failed}</p><p className="text-[11px] text-muted-foreground">Fallidos</p></div>
        </div>
        {failed.length > 0 && (
          <div className="space-y-2">
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {failed.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">
                    <b>{KIND[f.kind] ?? f.kind}</b> · {f.phone} · {f.error ?? "Error"} · {formatDate(f.created_at)}
                  </span>
                  <button onClick={() => cancel(f.id)} aria-label="Descartar" className="text-rose-200 hover:text-white"><XCircle className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={retry} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reintentar fallidos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
