import type { MediaKind } from "@/lib/types";
import { youtubeId } from "@/lib/utils";

/**
 * Convierte cualquier enlace en algo que la página sabe mostrar:
 * YouTube · TikTok · Instagram · Facebook · Vimeo · Google Drive · imagen · video · PDF
 */
export type ResolvedMedia =
  | { type: "youtube"; id: string; provider: "YouTube" }
  | { type: "iframe"; src: string; provider: string; vertical: boolean }
  | { type: "video"; src: string; provider: "Video" }
  | { type: "image"; src: string; provider: "Imagen" }
  | { type: "pdf"; src: string; provider: "PDF" };

export function resolveMedia(raw: string | null | undefined): ResolvedMedia | null {
  if (!raw) return null;
  const url = raw.trim();
  const yt = youtubeId(url);
  if (yt) return { type: "youtube", id: yt, provider: "YouTube" };
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return null;

  let m: RegExpMatchArray | null;
  if ((m = url.match(/tiktok\.com\/.*\/video\/(\d+)/i)))
    // Reproductor oficial actual de TikTok (el antiguo /embed/v2 muestra "Unable to load player")
    return {
      type: "iframe",
      src: `https://www.tiktok.com/player/v1/${m[1]}?music_info=0&description=0&rel=0&autoplay=1`,
      provider: "TikTok",
      vertical: true,
    };
  if ((m = url.match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i))) {
    const kind = m[1].toLowerCase() === "p" ? "p" : "reel";
    return { type: "iframe", src: `https://www.instagram.com/${kind}/${m[2]}/embed`, provider: "Instagram", vertical: true };
  }
  if (/facebook\.com\/.+\/(videos|reel)|facebook\.com\/(watch|reel)|fb\.watch\//i.test(url))
    return {
      type: "iframe",
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
      provider: "Facebook",
      vertical: /reel/i.test(url),
    };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)))
    return { type: "iframe", src: `https://player.vimeo.com/video/${m[1]}`, provider: "Vimeo", vertical: false };
  if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]+)/i)))
    return { type: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, provider: "Google Drive", vertical: false };
  if (/\.pdf(\?|#|$)/i.test(url)) return { type: "pdf", src: url, provider: "PDF" };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return { type: "video", src: url, provider: "Video" };
  if (/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url)) return { type: "image", src: url, provider: "Imagen" };
  return null;
}

/** Tipo a guardar en la base de datos para un enlace */
export function kindForLink(r: ResolvedMedia): MediaKind {
  return r.type === "iframe" ? "embed" : r.type;
}

export const LINK_HELP =
  "Pega un enlace de YouTube, TikTok, Instagram, Facebook, Vimeo o Google Drive, o el enlace directo a una imagen, video (.mp4) o PDF.";
