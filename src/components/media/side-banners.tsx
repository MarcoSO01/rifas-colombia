import type { MediaItem } from "@/lib/types";
import { MediaView } from "./media-view";

/** Banners verticales (laterales): imagen, video, YouTube/TikTok/IG/FB o PDF, con enlace opcional */
export function SideBanners({ items, className }: { items: MediaItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={className}>
      {items.map((m) => (
        <figure key={m.id} className="glass overflow-hidden rounded-2xl p-1 transition hover:border-brand-500/40">
          <MediaView
            item={m}
            videoProps={m.kind === "video" ? { autoPlay: true, muted: true, loop: true, controls: false } : undefined}
          />
          {m.caption && m.kind !== "pdf" && <figcaption className="px-2 py-1.5 text-center text-xs text-muted-foreground">{m.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
