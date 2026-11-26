"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Plus, QrCode, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PayMethod, PaymentMethod } from "@/lib/types";
import { METHOD_COLOR, METHOD_LABEL } from "@/lib/types";
import { cn, compressImage, friendlyError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Draft = Omit<PaymentMethod, "id"> & { id?: string };

const EMPTY: Draft = {
  method: "nequi", label: "", account_holder: "", account_number: "", account_type: "",
  instructions: "", qr_url: "", is_active: true, sort_order: 0,
};

export function PaymentMethodsManager({ initial }: { initial: PaymentMethod[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Draft[]>(initial);

  const add = () => setItems((prev) => [...prev, { ...EMPTY, sort_order: prev.length }]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estas cuentas se muestran en el checkout. Sube el QR de Nequi/Daviplata/Bre-B para que tus clientes lo escaneen.
        </p>
        <Button onClick={add}><Plus /> Agregar cuenta</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((it, i) => (
          <MethodCard
            key={it.id ?? `new-${i}`}
            item={it}
            onSaved={(saved) => {
              setItems((prev) => prev.map((p, j) => (j === i ? saved : p)));
              router.refresh();
            }}
            onDeleted={() => setItems((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      {items.length === 0 && (
        <p className="glass rounded-2xl p-10 text-center text-muted-foreground">
          Aún no tienes cuentas. Mientras tanto, el checkout solo mostrará “Efectivo / Presencial”.
        </p>
      )}
    </div>
  );
}

function MethodCard({ item, onSaved, onDeleted }: { item: Draft; onSaved: (p: PaymentMethod) => void; onDeleted: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState<Draft>(item);
  const [busy, setBusy] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const uploadQr = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const img = await compressImage(file, 900, 0.92);
    const path = `qr/${f.method}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("raffle-images").upload(path, img, { contentType: img.type });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setF((p) => ({ ...p, qr_url: supabase.storage.from("raffle-images").getPublicUrl(path).data.publicUrl }));
  };

  const save = async () => {
    if (!f.label.trim()) { toast.error("Ponle un nombre a la cuenta."); return; }
    setBusy(true);
    const row = {
      method: f.method,
      label: f.label.trim(),
      account_holder: f.account_holder || null,
      account_number: f.account_number || null,
      account_type: f.account_type || null,
      instructions: f.instructions || null,
      qr_url: f.qr_url || null,
      is_active: f.is_active,
      sort_order: Number(f.sort_order) || 0,
    };
    const q = f.id
      ? supabase.from("payment_methods").update(row).eq("id", f.id).select().single()
      : supabase.from("payment_methods").insert(row).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Cuenta guardada");
    setF(data as PaymentMethod);
    onSaved(data as PaymentMethod);
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    if (f.id) {
      const { error } = await supabase.from("payment_methods").delete().eq("id", f.id);
      if (error) { toast.error(friendlyError(error)); return; }
    }
    onDeleted();
  };

  return (
    <Card className={cn(!f.is_active && "opacity-60")}>
      <CardHeader className="flex-row items-center gap-3">
        <span className={cn("h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br", METHOD_COLOR[f.method])} />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{f.label || "Nueva cuenta"}</CardTitle>
          <CardDescription>{METHOD_LABEL[f.method]}</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setF((p) => ({ ...p, is_active: !p.is_active }))} aria-label="Activar/desactivar">
          {f.is_active ? <Eye /> : <EyeOff />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select value={f.method} onChange={set("method")} className="h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Nombre visible</Label><Input value={f.label} onChange={set("label")} placeholder="Nequi principal" /></div>
          {f.method !== "cash" && (
            <>
              <div className="space-y-1.5"><Label>Titular</Label><Input value={f.account_holder ?? ""} onChange={set("account_holder")} /></div>
              <div className="space-y-1.5">
                <Label>{f.method === "breb" ? "Llave Bre-B" : "Número / celular"}</Label>
                <Input value={f.account_number ?? ""} onChange={set("account_number")} placeholder={f.method === "breb" ? "@mitienda o 3001234567" : "3001234567"} />
              </div>
              {f.method === "bancolombia" && (
                <div className="space-y-1.5"><Label>Tipo de cuenta</Label><Input value={f.account_type ?? ""} onChange={set("account_type")} placeholder="Ahorros" /></div>
              )}
            </>
          )}
          <div className="space-y-1.5"><Label>Orden</Label><Input type="number" value={f.sort_order} onChange={set("sort_order")} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Instrucciones</Label>
          <Textarea value={f.instructions ?? ""} onChange={set("instructions")} placeholder={f.method === "cash" ? "Paga en Calle 10 #5-20, Bucaramanga, de lunes a sábado 8am-6pm." : "En el concepto escribe tu código de reserva."} />
        </div>
        {f.method !== "cash" && (
          <div className="flex items-center gap-3">
            <input ref={qrRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadQr(e.target.files?.[0])} />
            {f.qr_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.qr_url} alt="QR" className="h-20 w-20 rounded-lg bg-white p-1" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-white/15"><QrCode className="h-6 w-6 text-muted-foreground" /></div>
            )}
            <Button variant="outline" size="sm" onClick={() => qrRef.current?.click()} disabled={busy}>
              <QrCode /> {f.qr_url ? "Cambiar QR" : "Subir QR"}
            </Button>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
          <Button variant="ghost" onClick={remove} className="text-rose-300"><Trash2 /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
