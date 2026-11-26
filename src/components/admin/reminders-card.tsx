"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, CalendarClock, Check, ExternalLink, Loader2, MessageCircle, Wallet } from "lucide-react";
import { friendlyError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kind = "payment_reminder" | "draw_reminder";
interface ManualRecipient { name: string; phone: string; text: string; link: string }
interface Preview { mode: "api" | "bot" | "manual"; count: number; skipped: number; withoutPhone: number }

const KIND_INFO: Record<Kind, { label: string; desc: string; icon: typeof Wallet }> = {
  payment_reminder: { label: "Recordar pago a deudores", desc: "Abonos con saldo y reservas en efectivo sin pagar", icon: Wallet },
  draw_reminder: { label: "Recordar el sorteo a todos", desc: "Todos los que tienen números apartados o pagados", icon: CalendarClock },
};

async function callApi(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "UNKNOWN_ERROR");
  return json;
}

export function RemindersCard({ raffleId, compact = false }: { raffleId: string; compact?: boolean }) {
  const [preview, setPreview] = useState<Record<Kind, Preview | null>>({ payment_reminder: null, draw_reminder: null });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [manual, setManual] = useState<{ kind: Kind; list: ManualRecipient[] } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        callApi({ raffleId, kind: "payment_reminder", dryRun: true }),
        callApi({ raffleId, kind: "draw_reminder", dryRun: true }),
      ]);
      setPreview({ payment_reminder: a, draw_reminder: b });
      setPreviewError(null);
    } catch (e) {
      setPreview({ payment_reminder: null, draw_reminder: null });
      setPreviewError(friendlyError(e));
    }
  }, [raffleId]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const send = async (kind: Kind, force = false) => {
    const p = preview[kind];
    const count = p?.count ?? 0;
    if (!force && count === 0) {
      if (p?.skipped && confirm(`Ya se les envió este recordatorio en las últimas horas a ${p.skipped} personas. ¿Enviar de nuevo?`)) {
        return send(kind, true);
      }
      { toast.info("No hay destinatarios para este recordatorio."); return; }
    }
    if (p?.mode === "api" && !confirm(`Se enviará "${KIND_INFO[kind].label}" por WhatsApp a ${force ? "todas las" : count} personas. ¿Continuar?`)) return;
    if (p?.mode === "bot" && !confirm(`El bot enviará "${KIND_INFO[kind].label}" a ${force ? "todas las" : count} personas, uno cada pocos segundos. ¿Continuar?`)) return;

    setBusy(kind);
    try {
      const r = await callApi({ raffleId, kind, force });
      if (r.mode === "manual") {
        setDone(new Set());
        setManual({ kind, list: r.recipients });
      } else if (r.mode === "bot") {
        toast.success(`${r.queued} mensajes en cola. El bot los irá enviando (mira su estado en Reservas).${r.skipped ? ` Omitidos (ya avisados): ${r.skipped}` : ""}`);
      } else {
        toast.success(`Enviados: ${r.sent}${r.failed ? ` · Fallidos: ${r.failed}` : ""}${r.skipped ? ` · Omitidos (ya avisados): ${r.skipped}` : ""}`);
        if (r.failed && r.errors?.[0]) toast.error(`Ejemplo de error: ${r.errors[0].error}`);
      }
      loadPreview();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const mode = preview.draw_reminder?.mode ?? preview.payment_reminder?.mode;

  const buttons = (
    <div className="grid gap-2 sm:grid-cols-2">
      {(Object.keys(KIND_INFO) as Kind[]).map((k) => {
        const Icon = KIND_INFO[k].icon;
        const p = preview[k];
        return (
          <Button key={k} variant={k === "payment_reminder" ? "outline" : "secondary"} className="h-auto flex-col items-start gap-0.5 py-3 text-left" onClick={() => send(k)} disabled={!!busy}>
            <span className="flex items-center gap-2">
              {busy === k ? <Loader2 className="animate-spin" /> : <Icon />} {KIND_INFO[k].label}
            </span>
            <span className="whitespace-normal text-xs font-normal opacity-80">
              {p ? `${p.count} destinatario${p.count === 1 ? "" : "s"}` : previewError ? "No se pudo cargar" : "Cargando…"}
              {p?.skipped ? ` · ${p.skipped} ya avisados hoy` : ""}
              {p?.withoutPhone ? ` · ${p.withoutPhone} sin celular` : ""}
            </span>
            <span className="whitespace-normal text-[11px] font-normal opacity-60">{KIND_INFO[k].desc}</span>
          </Button>
        );
      })}
      {previewError && <p className="text-xs text-rose-300 sm:col-span-2">⚠ {previewError}</p>}
    </div>
  );

  return (
    <>
      {compact ? (
        <div className="space-y-2">{buttons}</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-brand-300" /> Recordatorios por WhatsApp</CardTitle>
            <CardDescription>
              {mode === "bot"
                ? "Se envían solos desde tu bot de WhatsApp (el programa debe estar abierto en tu PC)."
                : mode === "api"
                  ? "Se envían automáticamente con la API de WhatsApp."
                  : "Modo asistido: te mostramos cada mensaje listo y lo abres en WhatsApp con un clic."}
            </CardDescription>
          </CardHeader>
          <CardContent>{buttons}</CardContent>
        </Card>
      )}

      {/* Modo asistido: cola de mensajes */}
      <Dialog open={!!manual} onOpenChange={(v) => !v && setManual(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{manual ? KIND_INFO[manual.kind].label : ""}</DialogTitle>
            <DialogDescription>
              Toca cada botón: se abre WhatsApp con el mensaje escrito, solo dale enviar. {done.size}/{manual?.list.length ?? 0} enviados.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
            {manual?.list.length === 0 && <p className="text-center text-sm text-muted-foreground">No hay destinatarios.</p>}
            {manual?.list.map((r) => {
              const sent = done.has(r.phone);
              return (
                <div key={r.phone} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <Button asChild size="sm" variant={sent ? "outline" : "secondary"}>
                    <a href={r.link} target="_blank" rel="noopener noreferrer" onClick={() => setDone((d) => new Set(d).add(r.phone))}>
                      {sent ? <Check /> : <MessageCircle />} {sent ? "Abierto" : "Enviar"} <ExternalLink className="opacity-60" />
                    </a>
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
