"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, ImagePlus, Loader2, Pause, Rocket, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Raffle, RaffleStatus } from "@/lib/types";
import { RAFFLE_STATUS_LABEL } from "@/lib/types";
import { compressImage, digitsFor, formatCOP, friendlyError, slugify } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** ISO → valor para <input type="datetime-local"> en hora local */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function RaffleForm({ raffle }: { raffle?: Raffle }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(raffle);

  const [f, setF] = useState({
    title: raffle?.title ?? "",
    slug: raffle?.slug ?? "",
    prize: raffle?.prize ?? "",
    description: raffle?.description ?? "",
    image_url: raffle?.image_url ?? "",
    ticket_price: String(raffle?.ticket_price ?? 10000),
    total_numbers: String(raffle?.total_numbers ?? 100),
    draw_date: toLocalInput(raffle?.draw_date ?? null),
    lottery_reference: raffle?.lottery_reference ?? "",
    hold_minutes: String(raffle?.hold_minutes ?? 30),
    verification_minutes: String(raffle?.verification_minutes ?? 1440),
    min_partial_percent: String(raffle?.min_partial_percent ?? 30),
    max_numbers_per_order: String(raffle?.max_numbers_per_order ?? 20),
    winner_number: raffle?.winner_number != null ? String(raffle.winner_number) : "",
  });
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setF((prev) => ({
      ...prev,
      [k]: value,
      ...(k === "title" && !slugTouched ? { slug: slugify(value) } : {}),
    }));
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const img = await compressImage(file, 1600, 0.85);
    const path = `raffles/${Date.now()}-${slugify(file.name.replace(/\.\w+$/, "")) || "img"}.jpg`;
    const { error } = await supabase.storage.from("raffle-images").upload(path, img, { contentType: img.type });
    setUploading(false);
    if (error) { toast.error(friendlyError(error)); return; }
    const { data } = supabase.storage.from("raffle-images").getPublicUrl(path);
    setF((prev) => ({ ...prev, image_url: data.publicUrl }));
    // En una rifa existente la imagen se guarda de una vez (antes había que dar "Guardar")
    if (raffle) {
      const { data: saved, error: saveErr } = await supabase
        .from("raffles").update({ image_url: data.publicUrl }).eq("id", raffle.id).select("id");
      if (saveErr || !saved?.length) { toast.error(saveErr ? friendlyError(saveErr) : "No se pudo guardar la imagen (¿sesión de admin vencida?)."); return; }
      toast.success("Imagen guardada");
      router.refresh();
    } else {
      toast.success("Imagen cargada. Se guardará al crear la rifa.");
    }
  };

  const payload = () => ({
    title: f.title.trim(),
    slug: f.slug.trim(),
    prize: f.prize.trim(),
    description: f.description.trim() || null,
    image_url: f.image_url || null,
    ticket_price: Number(f.ticket_price),
    total_numbers: Number(f.total_numbers),
    draw_date: f.draw_date ? new Date(f.draw_date).toISOString() : null,
    lottery_reference: f.lottery_reference.trim() || null,
    hold_minutes: Number(f.hold_minutes),
    verification_minutes: Number(f.verification_minutes),
    min_partial_percent: Number(f.min_partial_percent),
    max_numbers_per_order: Number(f.max_numbers_per_order),
  });

  const save = async (status?: RaffleStatus) => {
    const p = payload();
    if (!p.title || !p.prize || !p.slug) { toast.error("Título, premio y enlace son obligatorios."); return; }
    if (!(p.ticket_price > 0)) { toast.error("El precio debe ser mayor a 0."); return; }
    if (!(p.total_numbers >= 10 && p.total_numbers <= 10000)) { toast.error("Los números deben estar entre 10 y 10.000."); return; }

    const extra: Record<string, unknown> = {};
    if (status) extra.status = status;
    if (status === "finished") {
      const w = Number.parseInt(f.winner_number, 10);
      if (Number.isNaN(w) || w < 0 || w >= p.total_numbers) { toast.error("Escribe un número ganador válido."); return; }
      if (!confirm(`¿Finalizar la rifa con el número ganador ${f.winner_number}? Ya no se podrán vender números.`)) return;
      extra.winner_number = w;
    }

    setBusy(status ?? "save");
    const query = isEdit
      ? supabase.from("raffles").update({ ...p, ...extra }).eq("id", raffle!.id).select("id").maybeSingle()
      : supabase.from("raffles").insert({ ...p, status: status ?? "draft" }).select("id").maybeSingle();
    const { data, error } = await query;
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    // Si la base de datos no devolvió nada, el cambio NO se guardó (permisos)
    if (!data) { toast.error("No se guardó: tu usuario no tiene permiso de administrador o la sesión venció. Cierra sesión y vuelve a entrar."); return; }
    toast.success(status ? `Rifa ${RAFFLE_STATUS_LABEL[status].toLowerCase()}` : "Cambios guardados");
    if (!isEdit && data) router.push(`/admin/rifas/${data.id}`);
    router.refresh();
  };

  const remove = async () => {
    if (!raffle || !confirm("¿Eliminar esta rifa en borrador? Esta acción no se puede deshacer.")) return;
    setBusy("delete");
    const { error } = await supabase.from("raffles").delete().eq("id", raffle.id);
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    router.push("/admin/rifas");
    router.refresh();
  };

  const total = Number(f.total_numbers) || 0;
  const potential = total * (Number(f.ticket_price) || 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{isEdit ? "Editar rifa" : "Nueva rifa"}</CardTitle>
        {raffle && <Badge variant={raffle.status === "published" ? "success" : "muted"}>{RAFFLE_STATUS_LABEL[raffle.status]}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Imagen */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-black/20 transition hover:border-brand-400/50"
        >
          {f.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <ImagePlus className="h-8 w-8" /> Imagen principal del premio
            </span>
          )}
          {uploading && <span className="absolute inset-0 grid place-items-center bg-black/60"><Loader2 className="h-8 w-8 animate-spin" /></span>}
        </button>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título *"><Input value={f.title} onChange={set("title")} placeholder="Gran rifa de diciembre" /></Field>
          <Field label="Enlace (slug) *">
            <Input value={f.slug} onChange={(e) => { setSlugTouched(true); setF((p) => ({ ...p, slug: slugify(e.target.value) })); }} placeholder="gran-rifa-diciembre" />
          </Field>
        </div>
        <Field label="Premio *"><Input value={f.prize} onChange={set("prize")} placeholder="Moto Yamaha NMAX 2026 + SOAT" /></Field>
        <Field label="Descripción"><Textarea value={f.description} onChange={set("description")} placeholder="Condiciones, entrega del premio, etc." /></Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio por boleta (COP) *"><Input type="number" min={1} value={f.ticket_price} onChange={set("ticket_price")} /></Field>
          <Field label="Cantidad de números *">
            <select value={["100", "1000", "10000"].includes(f.total_numbers) ? f.total_numbers : "custom"} onChange={(e) => e.target.value !== "custom" && setF((p) => ({ ...p, total_numbers: e.target.value }))} className="mb-2 h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
              <option value="100">100 (00–99)</option>
              <option value="1000">1.000 (000–999)</option>
              <option value="10000">10.000 (0000–9999)</option>
              <option value="custom">Otro…</option>
            </select>
            {!["100", "1000", "10000"].includes(f.total_numbers) && (
              <Input type="number" min={10} max={10000} value={f.total_numbers} onChange={set("total_numbers")} />
            )}
          </Field>
          <Field label="Fecha y hora del sorteo"><Input type="datetime-local" value={f.draw_date} onChange={set("draw_date")} /></Field>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {total > 0 && <>Cifras: <b>{digitsFor(total)}</b> · Recaudo potencial: <b className="text-brand-200">{formatCOP(potential)}</b></>}
        </p>

        <Field label="Lotería de referencia">
          <Input value={f.lottery_reference} onChange={set("lottery_reference")} placeholder="Juega con las 2 últimas cifras de la Lotería de Boyacá" />
        </Field>

        <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Reglas de reserva y abonos</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Minutos de reserva sin comprobante (efectivo)"><Input type="number" min={5} max={1440} value={f.hold_minutes} onChange={set("hold_minutes")} /></Field>
            <Field label="Minutos para verificar comprobante"><Input type="number" min={15} max={10080} value={f.verification_minutes} onChange={set("verification_minutes")} /></Field>
            <Field label="Abono mínimo (%)"><Input type="number" min={1} max={99} value={f.min_partial_percent} onChange={set("min_partial_percent")} /></Field>
            <Field label="Máx. números por compra"><Input type="number" min={1} max={500} value={f.max_numbers_per_order} onChange={set("max_numbers_per_order")} /></Field>
          </div>
        </details>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" onClick={() => save()} disabled={!!busy}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
          {raffle?.status !== "published" && raffle?.status !== "finished" && (
            <Button onClick={() => save("published")} disabled={!!busy}>
              {busy === "published" ? <Loader2 className="animate-spin" /> : <Rocket />} Publicar
            </Button>
          )}
          {raffle?.status === "published" && (
            <Button variant="outline" onClick={() => save("paused")} disabled={!!busy}>
              {busy === "paused" ? <Loader2 className="animate-spin" /> : <Pause />} Pausar
            </Button>
          )}
          {raffle?.status === "draft" && (
            <Button variant="ghost" onClick={remove} disabled={!!busy} className="text-rose-300">
              <Trash2 /> Eliminar
            </Button>
          )}
        </div>

        {isEdit && raffle?.status !== "draft" && (
          <div className="rounded-2xl border border-brand-400/30 bg-brand-400/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-100"><Crown className="h-4 w-4" /> Finalizar y anunciar ganador</p>
            <div className="flex gap-2">
              <Input inputMode="numeric" placeholder="Número ganador" value={f.winner_number} onChange={(e) => setF((p) => ({ ...p, winner_number: e.target.value.replace(/\D/g, "") }))} />
              <Button onClick={() => save("finished")} disabled={!!busy}>
                {busy === "finished" ? <Loader2 className="animate-spin" /> : <Crown />} Finalizar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
