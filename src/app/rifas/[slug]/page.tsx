import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookOpen, CalendarDays, Crown, Landmark, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import type { MediaItem, PaymentMethod, Raffle } from "@/lib/types";
import { RAFFLE_STATUS_LABEL } from "@/lib/types";
import { cn, formatCOP, formatDate, padNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/raffle/countdown";
import { RaffleBoard } from "@/components/raffle/raffle-board";
import { MediaCarousel, type Slide } from "@/components/media/media-carousel";
import { SideBanners } from "@/components/media/side-banners";
import { MediaView } from "@/components/media/media-view";
import { kindForLink, resolveMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("raffles").select("title, prize, image_url").eq("slug", slug).maybeSingle();
  if (!data) return { title: "Rifa no encontrada" };
  // La imagen de vista previa (Facebook, WhatsApp…) la genera opengraph-image.tsx
  return {
    title: data.title,
    description: `Participa por: ${data.prize}`,
    openGraph: { title: data.title, description: `Participa por: ${data.prize}` },
  };
}

export default async function RafflePage({ params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: raffle } = await supabase.from("raffles").select("*").eq("slug", slug).maybeSingle<Raffle>();
  if (!raffle) notFound();

  const [{ data: methods }, { data: media }, settings] = await Promise.all([
    supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("media_items").select("*").eq("raffle_id", raffle.id).eq("is_active", true).order("sort_order"),
    getSiteSettings(),
  ]);

  const items = (media ?? []) as MediaItem[];
  const gallery = items.filter((m) => m.placement === "gallery");
  const left = items.filter((m) => m.placement === "side_left");
  const right = items.filter((m) => m.placement === "side_right");
  const rules = items.filter((m) => m.placement === "rules");
  const howtoResolved = resolveMedia(settings.howto_video_url);
  const howto = howtoResolved && settings.howto_video_url
    ? { url: settings.howto_video_url, kind: kindForLink(howtoResolved), title: settings.howto_title }
    : null;
  const hasSides = left.length + right.length > 0;

  const slides: Slide[] = [
    ...(raffle.image_url ? [{ id: "main", kind: "image" as const, url: raffle.image_url }] : []),
    ...gallery.map((m) => ({ id: m.id, kind: m.kind, url: m.url, caption: m.caption, link_url: m.link_url })),
  ];

  return (
    <div className={cn("mx-auto w-full max-w-[1880px] py-6 lg:py-10", hasSides && "2xl:grid 2xl:grid-cols-[250px_minmax(0,1fr)_250px] 2xl:gap-6 2xl:px-6")}>
      {/* Banners laterales (pantallas grandes) */}
      {hasSides && (
        <aside className="hidden 2xl:block">
          <SideBanners items={left} className="sticky top-24 space-y-4" />
        </aside>
      )}

      <div className="container grid gap-6 lg:grid-cols-[380px_1fr] lg:gap-8">
        {/* Info de la rifa */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="glass overflow-hidden rounded-3xl">
            <MediaCarousel
              slides={slides}
              aspect="aspect-[4/3]"
              autoplayMs={5000}
              overlay={
                <Badge className="absolute left-3 top-3" variant={raffle.status === "published" ? "success" : "muted"}>
                  {RAFFLE_STATUS_LABEL[raffle.status]}
                </Badge>
              }
            />
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">Premio</p>
                <h1 className="font-display text-2xl font-black leading-tight sm:text-3xl">{raffle.prize}</h1>
              </div>
              <h2 className="text-lg font-bold">{raffle.title}</h2>
              {raffle.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{raffle.description}</p>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Ticket className="h-3.5 w-3.5" /> Boleta</p>
                  <p className="font-display text-xl font-black text-gradient">{formatCOP(raffle.ticket_price)}</p>
                </div>
                <div className="rounded-2xl bg-black/30 p-3">
                  <p className="text-xs text-muted-foreground">Números</p>
                  <p className="font-display text-xl font-black">
                    {padNumber(0, raffle.total_numbers)}–{padNumber(raffle.total_numbers - 1, raffle.total_numbers)}
                  </p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-brand-300" /> {formatDate(raffle.draw_date)}</p>
              {raffle.lottery_reference && (
                <p className="flex items-center gap-2 text-sm"><Landmark className="h-4 w-4 text-emerald-300" /> {raffle.lottery_reference}</p>
              )}
              {raffle.status === "finished" && raffle.winner_number !== null ? (
                <div className="rounded-2xl border border-brand-400/40 bg-brand-400/10 p-4 text-center">
                  <p className="text-xs uppercase tracking-wider text-brand-200">Número ganador</p>
                  <p className="flex items-center justify-center gap-2 font-display text-5xl font-black text-gradient">
                    <Crown className="h-8 w-8 text-brand-300" /> {padNumber(raffle.winner_number, raffle.total_numbers)}
                  </p>
                </div>
              ) : (
                raffle.draw_date && <Countdown to={raffle.draw_date} variant="big" expiredLabel="¡Sorteo en curso!" />
              )}
            </div>
          </div>
        </aside>

        {/* Cuadrícula en vivo */}
        <section className="min-w-0">
          <RaffleBoard
            raffle={raffle}
            paymentMethods={(methods ?? []) as PaymentMethod[]}
            ownerWhatsapp={settings.owner_whatsapp}
            howto={howto}
          />
        </section>

        {/* ¿Cómo se juega? — metodología (video, PDF o imagen) */}
        {(rules.length > 0 || raffle.lottery_reference) && (
          <section className="space-y-4 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-display text-2xl font-black italic">
              <BookOpen className="h-6 w-6 text-brand-500" /> ¿Cómo se juega?
            </h2>
            {raffle.lottery_reference && (
              <p className="glass rounded-2xl p-4 text-sm">
                <Landmark className="mr-1.5 inline h-4 w-4 text-brand-400" /> {raffle.lottery_reference}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {rules.map((m) => (
                <figure key={m.id} className="space-y-2">
                  <MediaView item={m} />
                  {m.caption && m.kind !== "pdf" && <figcaption className="text-sm text-muted-foreground">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Banners en celular / tablet */}
        {hasSides && <SideBanners items={[...left, ...right]} className="grid grid-cols-2 gap-3 lg:col-span-2 2xl:hidden" />}
      </div>

      {hasSides && (
        <aside className="hidden 2xl:block">
          <SideBanners items={right} className="sticky top-24 space-y-4" />
        </aside>
      )}
    </div>
  );
}
