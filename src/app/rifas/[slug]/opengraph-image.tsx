import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import { CARD_SIZE, cardText, loadFonts, loadImage, ShareCard } from "@/lib/share-card";
import type { ShareRaffle } from "@/lib/share";

// Vista previa al compartir el enlace en WhatsApp, Facebook, X, etc.
export const size = CARD_SIZE.og;
export const contentType = "image/png";
export const alt = "Sorteo";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: raffle } = await supabase
    .from("raffles")
    .select("title, slug, prize, ticket_price, total_numbers, draw_date, lottery_reference, image_url")
    .eq("slug", slug)
    .maybeSingle<ShareRaffle & { image_url: string | null }>();

  const settings = await getSiteSettings();
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const host = new URL(site).host;
  const logoUrl = settings.logo_url?.startsWith("/") ? `${site.replace(/\/$/, "")}${settings.logo_url}` : settings.logo_url;

  const fallback: ShareRaffle = {
    title: settings.brand_name, slug, prize: "Gran sorteo", ticket_price: 0, total_numbers: 100, draw_date: null, lottery_reference: null,
  };
  const r = raffle ?? fallback;
  const [logo, image, fonts] = await Promise.all([
    loadImage(logoUrl),
    loadImage(raffle?.image_url),
    loadFonts(cardText(r, host, settings.brand_name)),
  ]);

  return new ImageResponse(
    <ShareCard raffle={r} format="og" logo={logo} image={image} brand={settings.brand_name} host={host} />,
    { ...size, fonts },
  );
}
