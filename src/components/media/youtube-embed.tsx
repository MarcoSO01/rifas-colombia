"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn, youtubeId } from "@/lib/utils";

/**
 * Embed "liviano": muestra la miniatura y solo carga el reproductor de YouTube al tocar.
 * Así la página no se pone lenta en celulares.
 */
export function YouTubeEmbed({ url, title = "Video", className }: { url: string; title?: string; className?: string }) {
  const id = youtubeId(url);
  const [playing, setPlaying] = useState(false);
  if (!id) return null;

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-2xl bg-black", className)}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0" aria-label={`Reproducir: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" loading="lazy" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
          <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 shadow-brand transition group-hover:scale-110">
            <Play className="h-7 w-7 translate-x-0.5 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  );
}
