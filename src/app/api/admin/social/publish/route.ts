import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Publica la imagen + texto del sorteo en la PÁGINA de Facebook (Graph API).
 * Requiere FB_PAGE_ID y FB_PAGE_ACCESS_TOKEN, y que la web esté publicada (no localhost),
 * porque Facebook descarga la imagen desde tu dominio.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) return NextResponse.json({ error: "Facebook no está configurado (FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN)." }, { status: 400 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!site || /localhost|127\.0\.0\.1/.test(site)) {
    return NextResponse.json({ error: "Publicar en Facebook solo funciona con la página en internet (Vercel), no en localhost." }, { status: 400 });
  }

  const { raffleId, caption } = (await req.json().catch(() => ({}))) as { raffleId?: string; caption?: string };
  const { data: raffle } = await supabase.from("raffles").select("id, status").eq("id", raffleId ?? "").maybeSingle();
  if (!raffle) return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  if (raffle.status !== "published") return NextResponse.json({ error: "Publica la rifa antes de compartirla." }, { status: 400 });

  const imageUrl = `${site.replace(/\/$/, "")}/api/share-image/${raffle.id}?format=square&v=${Date.now()}`;
  const version = process.env.WHATSAPP_API_VERSION ?? "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
    method: "POST",
    body: new URLSearchParams({ url: imageUrl, caption: caption ?? "", published: "true", access_token: token }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: { message?: string } };
  if (!res.ok) return NextResponse.json({ error: json.error?.message ?? "Facebook rechazó la publicación" }, { status: 400 });
  return NextResponse.json({ ok: true, postId: json.post_id ?? json.id });
}
