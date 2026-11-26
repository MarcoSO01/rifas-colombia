"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, FileText, Film, ImagePlus, Link2, Loader2, Plus, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MediaItem, MediaPlacement } from "@/lib/types";
import { PLACEMENT_LABEL } from "@/lib/types";
import { cn, compressImage, friendlyError, youtubeId } from "@/lib/utils";
import { kindForLink, LINK_HELP, resolveMedia } from "@/lib/media";
import { MediaView } from "@/components/media/media-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_VIDEO = 50 * 1024 * 1024; // límite por archivo del plan gratuito de Supabase
const MAX_PDF = 20 * 1024 * 1024;
const BUCKET = "raffle-images";

const PLACEMENT_HINT: Record<MediaPlacement, string> = {
  home_banner: "Horizontal, ideal 1920×720 px",
  gallery: "Fotos/videos del premio, ideal 4:3 (1200×900 px)",
  rules: "Explica la metodología del juego: video, PDF del reglamento o una imagen",
  side_left: "Vertical, ideal 500×1000 px",
  side_right: "Vertical, ideal 500×1000 px",
};

interface Props {
  /** null = contenido global (banners del inicio) */
  raffleId: string | null;
  placements: MediaPlacement[];
  title?: string;
  description?: string;
}

export function MediaManager({ raffleId, placements, title = "Fotos, videos y banners", description }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<MediaPlacement>(placements[0]);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [ytUrl, setYtUrl] = useState("");
  const linkPreview = resolveMedia(ytUrl);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const load = useCallback(async () => {
    let q = supabase.from("media_items").select("*").in("placement", placements).order("sort_order");
    q = raffleId ? q.eq("raffle_id", raffleId) : q.is("raffle_id", null);
    const { data, error } = await q;
    if (error) toast.error(friendlyError(error));
    setItems((data ?? []) as MediaItem[]);
    setLoading(false);
  }, [supabase, raffleId, placements]);

  useEffect(() => {
    load();
  }, [load]);

  const nextOrder = (p: MediaPlacement) => Math.max(-1, ...items.filter((i) => i.placement === p).map((i) => i.sort_order)) + 1;

  const insert = async (kind: MediaItem["kind"], url: string) => {
    const { error } = await supabase.from("media_items").insert({
      raffle_id: raffleId, placement, kind, url,
      caption: caption.trim() || null, link_url: linkUrl.trim() || null, sort_order: nextOrder(placement),
    });
    if (error) throw error;
    setCaption("");
    setLinkUrl("");
    setYtUrl("");
    toast.success("Agregado");
    load();
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isPdf = file.type === "application/pdf";
    if (!isVideo && !isPdf && !file.type.startsWith("image/")) { toast.error("Sube una imagen, un video (MP4/MOV) o un PDF."); return; }
    if (isVideo && file.size > MAX_VIDEO) { toast.error("El video supera 50 MB. Súbelo a YouTube/TikTok y pega el enlace."); return; }
    if (isPdf && file.size > MAX_PDF) { toast.error("El PDF supera 20 MB."); return; }
    setBusy(true);
    try {
      const upload = isVideo || isPdf || file.type === "image/gif" ? file : await compressImage(file, 1920, 0.85);
      const ext = upload.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : isPdf ? "pdf" : "jpg");
      const path = `media/${raffleId ?? "home"}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, upload, { contentType: upload.type });
      if (error) throw error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      await insert(isVideo ? "video" : isPdf ? "pdf" : "image", url);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addLink = async () => {
    const r = resolveMedia(ytUrl);
    if (!r) {
      return toast.error(
        /vm\.tiktok|vt\.tiktok/i.test(ytUrl)
          ? "Ese es un enlace corto de TikTok. Abre el video en el navegador y copia el enlace completo (…/video/123…)."
          : "No reconocemos ese enlace. " + LINK_HELP,
      );
    }
    setBusy(true);
    try {
      await insert(kindForLink(r), ytUrl.trim());
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, patch: Partial<MediaItem>) => {
    const { error } = await supabase.from("media_items").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    load();
  };

  const move = async (item: MediaItem, dir: -1 | 1) => {
    const same = items.filter((i) => i.placement === item.placement).sort((a, b) => a.sort_order - b.sort_order);
    const idx = same.findIndex((i) => i.id === item.id);
    const other = same[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("media_items").update({ sort_order: other.sort_order }).eq("id", item.id),
      supabase.from("media_items").update({ sort_order: item.sort_order === other.sort_order ? item.sort_order + dir : item.sort_order }).eq("id", other.id),
    ]);
    load();
  };

  const remove = async (item: MediaItem) => {
    if (!confirm("¿Eliminar este elemento?")) return;
    const { error } = await supabase.from("media_items").delete().eq("id", item.id);
    if (error) { toast.error(friendlyError(error)); return; }
    const marker = `/object/public/${BUCKET}/`;
    if (item.url.includes(marker)) {
      await supabase.storage.from(BUCKET).remove([decodeURIComponent(item.url.split(marker)[1])]);
    }
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-brand-300" /> {title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Agregar */}
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {placements.length > 1 && (
              <div className="space-y-1.5">
                <Label>Ubicación</Label>
                <select value={placement} onChange={(e) => setPlacement(e.target.value as MediaPlacement)} className="h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm">
                  {placements.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 p-1">
                {[
                  { id: "file" as const, label: "Foto / video", icon: Film },
                  { id: "link" as const, label: "Enlace", icon: Link2 },
                ].map((m) => (
                  <button key={m.id} type="button" onClick={() => setMode(m.id)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition", mode === m.id ? "bg-brand-400 text-white" : "text-muted-foreground hover:bg-white/5")}>
                    <m.icon className="h-4 w-4" /> {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{PLACEMENT_HINT[placement]}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Texto (opcional)</Label><Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ej. ¡Moto 0 km!" /></div>
            <div className="space-y-1.5"><Label>Enlace al tocar (opcional)</Label><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." /></div>
          </div>

          {mode === "file" ? (
            <>
              <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
              <Button type="button" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />} Subir foto, video (máx. 50 MB) o PDF
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.tiktok.com/@cuenta/video/..." />
                <Button type="button" onClick={addLink} disabled={busy || !linkPreview}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Agregar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {ytUrl && linkPreview ? <span className="text-emerald-300">✓ Detectado: {linkPreview.provider}</span> : LINK_HELP}
              </p>
              {linkPreview && (
                <div className="max-w-xs">
                  <MediaView item={{ kind: kindForLink(linkPreview), url: ytUrl.trim() }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="grid place-items-center py-6"><Loader2 className="h-6 w-6 animate-spin text-brand-300" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Aún no has agregado nada.</p>
        ) : (
          placements.map((p) => {
            const list = items.filter((i) => i.placement === p).sort((a, b) => a.sort_order - b.sort_order);
            if (!list.length) return null;
            return (
              <div key={p} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{PLACEMENT_LABEL[p]}</p>
                {list.map((m, i) => (
                  <div key={m.id} className={cn("flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2", !m.is_active && "opacity-50")}>
                    <Thumb item={m} />
                    <div className="min-w-0 flex-1">
                      <Badge variant="muted">{resolveMedia(m.url)?.provider ?? (m.kind === "video" ? "Video" : m.kind === "pdf" ? "PDF" : "Foto")}</Badge>
                      <p className="mt-1 truncate text-sm">{m.caption || <span className="text-muted-foreground">Sin texto</span>}</p>
                      {m.link_url && <p className="flex items-center gap-1 truncate text-xs text-sky-300"><Link2 className="h-3 w-3" />{m.link_url}</p>}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button size="icon" variant="ghost" onClick={() => move(m, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" onClick={() => move(m, 1)} disabled={i === list.length - 1} aria-label="Bajar"><ArrowDown /></Button>
                      <Button size="icon" variant="ghost" onClick={() => update(m.id, { is_active: !m.is_active })} aria-label="Mostrar u ocultar">
                        {m.is_active ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(m)} className="text-rose-300" aria-label="Eliminar"><Trash2 /></Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function Thumb({ item }: { item: MediaItem }) {
  const cls = "h-16 w-20 shrink-0 rounded-xl bg-black object-cover";
  if (item.kind === "youtube") {
    const id = youtubeId(item.url);
    // eslint-disable-next-line @next/next/no-img-element
    return id ? <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className={cls} /> : <div className={cls} />;
  }
  if (item.kind === "video") return <video src={item.url} muted preload="metadata" className={cls} />;
  if (item.kind === "pdf") return <div className={cn(cls, "grid place-items-center")}><FileText className="h-7 w-7 text-brand-400" /></div>;
  if (item.kind === "embed") return <div className={cn(cls, "grid place-items-center text-[10px] font-bold text-white/70")}>{resolveMedia(item.url)?.provider ?? "Video"}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.url} alt="" className={cls} />;
}
