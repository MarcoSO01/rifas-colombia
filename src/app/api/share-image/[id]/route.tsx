import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import { CARD_SIZE, cardText, loadFonts, loadImage, ShareCard, type CardFormat } from "@/lib/share-card";
import type { ShareRaffle } from "@/lib/share";

export const runtime = "nodejs";

/** GET /api/share-image/<raffleId>?format=square|story|og → PNG para redes sociales */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const f = url.searchParams.get("format");
  const format: CardFormat = f === "story" || f === "og" ? f : "square";

  const supabase = await createClient();
  const { data: raffle } = await supabase
    .from("raffles")
    .select("title, slug, prize, ticket_price, total_numbers, draw_date, lottery_reference, image_url")
    .eq("id", id)
    .maybeSingle<ShareRaffle & { image_url: string | null }>();
  if (!raffle) return new Response("Rifa no encontrada", { status: 404 });

  const settings = await getSiteSettings();
  const site = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const host = new URL(site).host;
  const logoUrl = settings.logo_url?.startsWith("/") ? `${url.origin}${settings.logo_url}` : settings.logo_url;
  const [logo, image, fonts] = await Promise.all([
    loadImage(logoUrl),
    loadImage(raffle.image_url),
    loadFonts(cardText(raffle, host, settings.brand_name)),
  ]);

  return new ImageResponse(
    <ShareCard raffle={raffle} format={format} logo={logo} image={image} brand={settings.brand_name} host={host} />,
    { ...CARD_SIZE[format], fonts, headers: { "Cache-Control": "public, max-age=300" } },
  );
}
