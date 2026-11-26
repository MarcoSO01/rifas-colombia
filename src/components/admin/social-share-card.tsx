"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, ImageDown, Loader2, Megaphone, RefreshCw, Send, Share2 } from "lucide-react";
import type { Raffle, SiteSettings } from "@/lib/types";
import { buildShareCaption, raffleUrl } from "@/lib/share";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/social/icons";

type Format = "square" | "story";

export function SocialShareCard({
  raffle, settings, facebookConfigured,
}: {
  raffle: Raffle; settings: SiteSettings; facebookConfigured: boolean;
}) {
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const [format, setFormat] = useState<Format>("square");
  const [nonce, setNonce] = useState(() => Date.now());
  const [loadingImg, setLoadingImg] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SITE_URL) setOrigin(window.location.origin);
  }, []);

  const link = useMemo(() => raffleUrl(origin || "", raffle.slug), [origin, raffle.slug]);
  useEffect(() => {
    if (origin) setCaption(buildShareCaption(raffle, link, settings.share_hashtags));
  }, [origin, link, raffle, settings.share_hashtags]);

  const imgSrc = `/api/share-image/${raffle.id}?format=${format}&v=${nonce}`;
  const fileName = `sorteo-${raffle.slug}-${format === "story" ? "historia" : "publicacion"}.png`;

  const getFile = async () => {
    const res = await fetch(imgSrc);
    if (!res.ok) throw new Error("No se pudo generar la imagen");
    return new File([await res.blob()], fileName, { type: "image/png" });
  };

  const copy = async (text: string, msg = "Texto copiado") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const download = async () => {
    const file = await getFile();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error((e as Error)?.message ?? "Error");
    } finally {
      setBusy(null);
    }
  };

  /** Celular: abre el menú nativo para compartir → Instagram, TikTok, Facebook, WhatsApp… */
  const shareNative = run("native", async () => {
    const file = await getFile();
    const data = { files: [file], text: caption, title: raffle.title };
    if (navigator.canShare?.(data)) {
      await copy(caption, "Texto copiado: pégalo como descripción si la app no lo incluye");
      await navigator.share(data);
    } else {
      toast.info("Este navegador no permite compartir imágenes. Usa “Descargar imagen” y súbela en la app.");
    }
  });

  const manualApp = (key: string, appUrl: string, name: string) =>
    run(key, async () => {
      await download();
      await copy(caption, `Imagen descargada y texto copiado. Súbela en ${name} y pega el texto.`);
      window.open(appUrl, "_blank", "noopener");
    });

  const facebook = run("fb", async () => {
    if (!facebookConfigured) {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener,width=640,height=640");
      return;
    }
    if (!confirm("¿Publicar ahora en tu página de Facebook?")) return;
    const res = await fetch("/api/admin/social/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raffleId: raffle.id, caption }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast.success("¡Publicado en Facebook!");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-brand-500" /> Publicar en redes</CardTitle>
        <CardDescription>Imagen y texto generados con la información del sorteo. Revisa la vista previa y comparte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {raffle.status !== "published" && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            La rifa aún no está publicada: el enlace no funcionará para tus seguidores hasta que la publiques.
          </p>
        )}

        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {([["square", "Publicación (1:1)"], ["story", "Historia / Reel (9:16)"]] as const).map(([f, l]) => (
            <button
              key={f}
              type="button"
              onClick={() => { setFormat(f); setLoadingImg(true); }}
              className={cn("flex-1 rounded-lg py-2 text-xs font-semibold transition", format === f ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-white/5")}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
          {/* Vista previa de la imagen */}
          <div className="relative mx-auto w-full max-w-[220px]">
            <div className={cn("relative overflow-hidden rounded-xl border border-white/10 bg-black", format === "story" ? "aspect-[9/16]" : "aspect-square")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt="Vista previa" className="h-full w-full object-contain" onLoad={() => setLoadingImg(false)} onError={() => setLoadingImg(false)} />
              {loadingImg && <div className="absolute inset-0 grid place-items-center bg-black/60"><Loader2 className="animate-spin" /></div>}
            </div>
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => { setNonce(Date.now()); setLoadingImg(true); }}>
              <RefreshCw /> Regenerar
            </Button>
          </div>

          {/* Vista previa del texto */}
          <div className="space-y-2">
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="min-h-[220px] text-xs" />
            <p className="text-[11px] text-muted-foreground">Puedes editar el texto antes de publicar. Los hashtags se cambian en Admin → Contenido.</p>
          </div>
        </div>

        <Button className="w-full" variant="secondary" onClick={shareNative} disabled={!!busy}>
          {busy === "native" ? <Loader2 className="animate-spin" /> : <Share2 />} Compartir desde el celular (Instagram, TikTok, WhatsApp…)
        </Button>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" onClick={facebook} disabled={!!busy} className="border-[#1877F2]/50">
            {busy === "fb" ? <Loader2 className="animate-spin" /> : <FacebookIcon className="h-4 w-4 text-[#1877F2]" />} Facebook
          </Button>
          <Button variant="outline" onClick={manualApp("ig", "https://www.instagram.com/", "Instagram")} disabled={!!busy} className="border-pink-500/40">
            {busy === "ig" ? <Loader2 className="animate-spin" /> : <InstagramIcon className="h-4 w-4 text-pink-400" />} Instagram
          </Button>
          <Button variant="outline" onClick={manualApp("tt", "https://www.tiktok.com/upload", "TikTok")} disabled={!!busy}>
            {busy === "tt" ? <Loader2 className="animate-spin" /> : <TikTokIcon className="h-4 w-4" />} TikTok
          </Button>
          <Button variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener")} className="border-[#25D366]/50">
            <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> WhatsApp
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={run("dl", download)} disabled={!!busy}><ImageDown /> Descargar imagen</Button>
          <Button size="sm" variant="ghost" onClick={() => copy(caption)}><Copy /> Copiar texto</Button>
          <Button size="sm" variant="ghost" onClick={() => copy(link, "Enlace copiado")}><Send /> Copiar enlace</Button>
          <Button size="sm" variant="ghost" asChild><a href={imgSrc} target="_blank" rel="noopener noreferrer"><Download /> Ver en grande</a></Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {facebookConfigured
            ? "Facebook: se publica directo en tu página. Instagram y TikTok: desde el celular usa “Compartir”; en computador se descarga la imagen y se copia el texto."
            : "Facebook: abre la ventana para compartir con vista previa (para publicar directo en tu página configura FB_PAGE_ID y FB_PAGE_ACCESS_TOKEN). Instagram y TikTok no permiten publicar desde una web: usa “Compartir desde el celular” o descarga la imagen."}
        </p>
      </CardContent>
    </Card>
  );
}
