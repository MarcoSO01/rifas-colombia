import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SiteSettings } from "@/lib/types";

export const DEFAULT_SETTINGS: SiteSettings = {
  brand_name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Iñistare Sorteos",
  tagline: null,
  logo_url: "/logo.png",
  howto_title: "¿Cómo participar?",
  howto_video_url: null,
  owner_whatsapp: process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ?? null,
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  share_hashtags: "#sorteo #rifa #Colombia",
};

export function mergeSettings(row: Partial<SiteSettings> | null | undefined): SiteSettings {
  const clean = Object.fromEntries(Object.entries(row ?? {}).filter(([, v]) => v !== null && v !== ""));
  return { ...DEFAULT_SETTINGS, ...clean } as SiteSettings;
}

/** Configuración del sitio (una consulta por request gracias a cache) */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
    return mergeSettings(data as Partial<SiteSettings> | null);
  } catch {
    return DEFAULT_SETTINGS;
  }
});
