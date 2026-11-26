"use client";

import { useState } from "react";
import { ExternalLink, FileText, Play } from "lucide-react";
import type { MediaKind } from "@/lib/types";
import { resolveMedia } from "@/lib/media";
import { cn } from "@/lib/utils";
import { YouTubeEmbed } from "./youtube-embed";

export interface MediaLike {
  kind: MediaKind;
  url: string;
  caption?: string | null;
  link_url?: string | null;
}

interface Props {
  item: MediaLike;
  /** "fill" ocupa el contenedor (carrusel); "natural" usa su propia proporción (secciones, banners) */
  layout?: "fill" | "natural";
  className?: string;
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
}

/** Muestra cualquier multimedia: imagen, video, YouTube, TikTok/IG/FB/Vimeo/Drive o PDF */
export function MediaView({ item, layout = "natural", className, videoProps }: Props) {
  const fill = layout === "fill";
  const resolved = item.kind === "embed" || item.kind === "youtube" ? resolveMedia(item.url) : null;

  let content: React.ReactNode = null;

  if (item.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    content = <img src={item.url} alt={item.caption ?? ""} loading="lazy" className={cn("w-full object-cover", fill ? "h-full" : "h-auto rounded-2xl")} />;
  } else if (item.kind === "video") {
    content = (
      <video
        src={item.url}
        controls
        playsInline
        preload="metadata"
        className={cn("w-full bg-black", fill ? "h-full object-contain" : "h-auto rounded-2xl")}
        {...videoProps}
      />
    );
  } else if (item.kind === "pdf") {
    content = <PdfCard url={item.url} caption={item.caption} fill={fill} />;
  } else if (resolved?.type === "youtube") {
    content = <YouTubeEmbed url={item.url} title={item.caption ?? "Video"} className={cn(fill && "h-full rounded-none")} />;
  } else if (resolved?.type === "iframe") {
    content = <LazyIframe src={resolved.src} provider={resolved.provider} vertical={resolved.vertical} fill={fill} />;
  } else {
    content = (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 p-6 text-sm">
        <ExternalLink className="h-4 w-4" /> Abrir enlace
      </a>
    );
  }

  const wrapped =
    item.kind === "image" && item.link_url ? (
      <a href={item.link_url} target="_blank" rel="noopener noreferrer" className={cn("block", fill && "h-full")}>{content}</a>
    ) : (
      content
    );

  return <div className={cn(fill && "h-full w-full", className)}>{wrapped}</div>;
}

/** Carga el reproductor externo solo al tocar (más rápido en celular) */
function LazyIframe({ src, provider, vertical, fill }: { src: string; provider: string; vertical: boolean; fill: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden bg-black",
        fill ? "h-full w-full" : cn("w-full rounded-2xl", vertical ? "aspect-[9/16] max-w-[360px]" : "aspect-video"),
      )}
    >
      {on ? (
        <iframe
          src={src}
          title={provider}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="group absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-900 to-black">
          <span className="flex flex-col items-center gap-3">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand transition group-hover:scale-110">
              <Play className="h-7 w-7 translate-x-0.5 fill-white text-white" />
            </span>
            <span className="text-sm font-semibold text-white/80">Ver video de {provider}</span>
          </span>
        </button>
      )}
    </div>
  );
}

function PdfCard({ url, caption, fill }: { url: string; caption?: string | null; fill: boolean }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950", fill && "h-full rounded-none border-0")}>
      {/* Vista previa en computador (los celulares abren el PDF aparte) */}
      <iframe src={`${url}#view=FitH&toolbar=0`} title={caption ?? "PDF"} className={cn("hidden w-full bg-white md:block", fill ? "flex-1" : "h-[480px]")} />
      <div className={cn("flex items-center gap-3 p-4", fill && "md:hidden flex-1 justify-center")}>
        <FileText className="h-9 w-9 shrink-0 text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{caption || "Documento PDF"}</p>
          <p className="text-xs text-muted-foreground">Toca para abrir o descargar</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-neutral-950">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir
        </a>
      </div>
    </div>
  );
}
