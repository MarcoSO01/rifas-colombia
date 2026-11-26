"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HandCoins, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PayMethod, Raffle } from "@/lib/types";
import { METHOD_LABEL } from "@/lib/types";
import { formatCOP, friendlyError, isValidCoPhone, normalizePhone, padNumber } from "@/lib/utils";
import { useNow, useRaffleTickets } from "@/hooks/use-raffle-tickets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GridLegend, NumberGrid } from "@/components/raffle/number-grid";

/** Venta / asignación manual de números (pago presencial directo) */
export function ManualSale({ raffle }: { raffle: Raffle }) {
  const now = useNow(5000);
  const { tickets, loading, refresh } = useRaffleTickets(raffle.id);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [buyer, setBuyer] = useState({ name: "", phone: "", nationalId: "", email: "" });
  const [fullPayment, setFullPayment] = useState(true);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [saving, setSaving] = useState(false);

  const total = selected.size * raffle.ticket_price;
  const paidValue = Number(paid.replace(/\D/g, "")) || 0;

  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const submit = async () => {
    if (!selected.size) { toast.error("Selecciona los números a asignar."); return; }
    if (!buyer.name.trim()) { toast.error("Escribe el nombre del comprador."); return; }
    if (buyer.phone && !isValidCoPhone(buyer.phone)) { toast.error("Celular inválido (10 dígitos)."); return; }
    setSaving(true);
    const { error } = await createClient().rpc("admin_manual_sale", {
      p_raffle_id: raffle.id,
      p_numbers: [...selected],
      p_buyer_name: buyer.name.trim(),
      p_buyer_phone: buyer.phone ? normalizePhone(buyer.phone) : null,
      p_buyer_national_id: buyer.nationalId.trim() || null,
      p_buyer_email: buyer.email.trim() || null,
      p_amount_paid: fullPayment ? null : paidValue,
      p_method: method,
      p_note: "Venta manual desde el panel",
    });
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error));
      refresh();
      return;
    }
    toast.success(`Asignados ${selected.size} números a ${buyer.name}`);
    setSelected(new Set());
    setBuyer({ name: "", phone: "", nationalId: "", email: "" });
    setPaid("");
    refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-brand-300" /> Venta manual</CardTitle>
        <CardDescription>Asigna números a un comprador que pagó en persona o por otro canal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NumberGrid total={raffle.total_numbers} tickets={tickets} now={now} selected={selected} onToggle={toggle} loading={loading} detailed />
        <GridLegend detailed />

        {selected.size > 0 && (
          <p className="rounded-xl bg-brand-400/10 p-3 text-sm">
            {[...selected].sort((a, b) => a - b).map((n) => padNumber(n, raffle.total_numbers)).join(", ")} ·{" "}
            <b className="text-brand-200">{formatCOP(total)}</b>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Nombre *</Label><Input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Cédula</Label><Input inputMode="numeric" value={buyer.nationalId} onChange={(e) => setBuyer({ ...buyer, nationalId: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>WhatsApp</Label><Input inputMode="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></div>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">Con cédula y celular, el comprador puede consultar sus números en la página y recibir recordatorios.</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Medio</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Pago</Label>
            <select value={fullPayment ? "full" : "partial"} onChange={(e) => setFullPayment(e.target.value === "full")} className="h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
              <option value="full">Pagó completo</option>
              <option value="partial">Abono / fiado</option>
            </select>
          </div>
          {!fullPayment && (
            <div className="space-y-1.5">
              <Label>Monto recibido</Label>
              <Input inputMode="numeric" value={paidValue ? paidValue.toLocaleString("es-CO") : ""} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>

        <Button className="w-full" onClick={submit} disabled={saving || !selected.size}>
          {saving ? <Loader2 className="animate-spin" /> : <HandCoins />} Asignar {selected.size || ""} números
        </Button>
      </CardContent>
    </Card>
  );
}
