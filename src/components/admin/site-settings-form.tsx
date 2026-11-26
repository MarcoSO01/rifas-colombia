"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SiteSettings } from "@/lib/types";
import { compressImage, friendlyError, isValidCoPhone, normalizePhone } from "@/lib/utils";
import { kindForLink, LINK_HELP, resolveMedia } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaView } from "@/components/media/media-view";

export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    brand_name: initial.brand_name ?? "",
    tagline: initial.tagline ?? "",
    logo_url: initial.logo_url ?? "",
    howto_title: initial.howto_title ?? "¿Cómo participar?",
    howto_video_url: initial.howto_video_url ?? "",
    owner_whatsapp: initial.owner_whatsapp ?? "",
    facebook_url: initial.facebook_url ?? "",
    instagram_url: initial.instagram_url ?? "",
    tiktok_url: initial.tiktok_url ?? "",
    share_hashtags: initial.share_hashtags ?? "#sorteo #rifa #Colombia",
  });
  const howto = resolveMedia(f.howto_video_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const supabase = createClient();
    // PNG/WEBP pequeños se suben tal cual para conservar la transparencia
    const img = (file.type === "image/png" || file.type === "image/webp") && file.size < 1024 * 1024 ? file : await compressImage(file, 600, 0.9);
    const ext = img.type.split("/")[1] ?? "png";
    const path = `branding/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("raffle-images").upload(path, img, { contentType: img.type });
    setUploading(false);
    if (error) { toast.error(friendlyError(error)); return; }
    const logoUrl = supabase.storage.from("raffle-images").getPublicUrl(path).data.publicUrl;
    setF((p) => ({ ...p, logo_url: logoUrl }));
    // El logo se guarda de una vez
    const { data: saved } = await supabase.from("site_settings").update({ logo_url: logoUrl }).eq("id", 1).select("id");
    if (!saved?.length) { toast.error("No se pudo guardar el logo (¿sesión de admin vencida?)."); return; }
    toast.success("Logo guardado");
    router.refresh();
  };

  const save = async () => {
    if (!f.brand_name.trim()) { toast.error("Escribe el nombre de la marca."); return; }
    if (f.howto_video_url && !howto) { toast.error("No reconocemos el enlace del video. " + LINK_HELP); return; }
    for (const k of ["facebook_url", "instagram_url", "tiktok_url"] as const) {
      if (f[k] && !/^https?:\/\//i.test(f[k])) { toast.error("Los enlaces de redes deben empezar por https://"); return; }
    }
    if (f.owner_whatsapp && !isValidCoPhone(f.owner_whatsapp)) { toast.error("El WhatsApp del organizador debe tener 10 dígitos."); return; }
    setSaving(true);
    const { data, error } = await createClient()
      .from("site_settings")
      .update({
        brand_name: f.brand_name.trim(),
        tagline: f.tagline.trim() || null,
        logo_url: f.logo_url || null,
        howto_title: f.howto_title.trim() || "¿Cómo participar?",
        howto_video_url: f.howto_video_url.trim() || null,
        owner_whatsapp: f.owner_whatsapp ? normalizePhone(f.owner_whatsapp) : null,
        facebook_url: f.facebook_url.trim() || null,
        instagram_url: f.instagram_url.trim() || null,
        tiktok_url: f.tiktok_url.trim() || null,
        share_hashtags: f.share_hashtags.trim() || null,
      })
      .eq("id", 1)
      .select("id");
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    if (!data?.length) { toast.error("No se guardó: tu usuario no tiene permiso de administrador o la sesión venció. Cierra sesión y vuelve a entrar."); return; }
    toast.success("Contenido guardado");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca y página de inicio</CardTitle>
        <CardDescription>Logo, nombre, video de “cómo participar” y el WhatsApp que recibe los avisos de compra.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-black/20 hover:border-brand-400/50">
            {uploading ? <Loader2 className="animate-spin" /> : f.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.logo_url} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
          </button>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Logo</p>
            <p className="text-xs text-muted-foreground">PNG con fondo transparente, cuadrado o horizontal.</p>
            {f.logo_url && (
              <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => setF((p) => ({ ...p, logo_url: "" }))}><Trash2 /> Quitar</Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nombre de la marca</Label><Input value={f.brand_name} onChange={set("brand_name")} /></div>
          <div className="space-y-1.5"><Label>WhatsApp del organizador</Label><Input value={f.owner_whatsapp} onChange={set("owner_whatsapp")} inputMode="tel" placeholder="300 123 4567" /></div>
        </div>
        <div className="space-y-1.5"><Label>Frase de bienvenida</Label><Textarea value={f.tagline} onChange={set("tagline")} placeholder="Aparta tus números en segundos y paga como quieras…" /></div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Título del video</Label><Input value={f.howto_title} onChange={set("howto_title")} /></div>
          <div className="space-y-1.5"><Label>Video que enseña a usar la página</Label><Input value={f.howto_video_url} onChange={set("howto_video_url")} placeholder="Enlace de YouTube, TikTok, Instagram, Facebook o .mp4" /></div>
        </div>
        {howto && (
          <div className="max-w-md">
            <p className="mb-1 text-xs text-emerald-300">✓ {howto.provider}</p>
            <MediaView item={{ kind: kindForLink(howto), url: f.howto_video_url.trim() }} />
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold">Redes sociales</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Facebook</Label><Input value={f.facebook_url} onChange={set("facebook_url")} placeholder="https://facebook.com/..." /></div>
            <div className="space-y-1.5"><Label>Instagram</Label><Input value={f.instagram_url} onChange={set("instagram_url")} placeholder="https://instagram.com/..." /></div>
            <div className="space-y-1.5"><Label>TikTok</Label><Input value={f.tiktok_url} onChange={set("tiktok_url")} placeholder="https://tiktok.com/@..." /></div>
          </div>
          <div className="space-y-1.5"><Label>Hashtags para publicaciones</Label><Input value={f.share_hashtags} onChange={set("share_hashtags")} /></div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </CardContent>
    </Card>
  );
}
