"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import { ageFrom, friendlyError, isValidCoPhone, normalizePhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ profile, next }: { profile: UserProfile; next?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    birth_date: profile.birth_date ?? "",
    national_id: profile.national_id ?? "",
    consent: Boolean(profile.data_consent_at),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.full_name.trim().length < 5) return toast.error("Escribe tu nombre completo.");
    if (!isValidCoPhone(form.phone)) return toast.error("El WhatsApp debe ser un celular colombiano de 10 dígitos.");
    if (!form.birth_date) return toast.error("Indica tu fecha de nacimiento.");
    if (ageFrom(form.birth_date) < 18) return toast.error("Debes ser mayor de 18 años para participar.");
    if (!form.consent) return toast.error("Debes autorizar el tratamiento de tus datos personales.");

    setSaving(true);
    const { error } = await createClient()
      .from("users")
      .update({
        full_name: form.full_name.trim(),
        phone: normalizePhone(form.phone),
        birth_date: form.birth_date,
        national_id: form.national_id.trim() || null,
        data_consent_at: profile.data_consent_at ?? new Date().toISOString(),
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Perfil guardado");
    router.push(next ?? "/");
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo (Google)</Label>
            <Input id="email" value={profile.email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Nombre completo *</Label>
            <Input id="full_name" value={form.full_name} onChange={set("full_name")} autoComplete="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">WhatsApp *</Label>
            <Input id="phone" value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="300 123 4567" autoComplete="tel" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birth_date">Fecha de nacimiento *</Label>
            <Input id="birth_date" type="date" value={form.birth_date} onChange={set("birth_date")} max={new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="national_id">Cédula (opcional, para entrega del premio)</Label>
            <Input id="national_id" value={form.national_id} onChange={set("national_id")} inputMode="numeric" />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.consent} onChange={set("consent")} className="mt-0.5 h-4 w-4 accent-amber-400" />
            <span>
              Autorizo el tratamiento de mis datos personales para gestionar mis compras, verificar pagos y la entrega de
              premios, conforme a la Ley 1581 de 2012. Declaro ser mayor de 18 años.
            </span>
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar y continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
