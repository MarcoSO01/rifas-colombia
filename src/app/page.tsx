import { PlayCircle, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import type { MediaItem, RaffleSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RaffleTabs } from "@/components/raffle/raffle-tabs";
import { MediaCarousel } from "@/components/media/media-carousel";
import { MediaView } from "@/components/media/media-view";
import { HowToSteps } from "@/components/help/how-to-steps";
import { SocialLinks } from "@/components/social/social-links";
import { kindForLink, resolveMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data }, { data: bannerRows }, settings] = await Promise.all([
    supabase
      .from("raffle_summary")
      .select("*")
      .in("status", ["published", "paused", "finished"])
      .order("draw_date", { ascending: true, nullsFirst: false }),
    supabase.from("media_items").select("*").eq("placement", "home_banner").eq("is_active", true).order("sort_order"),
    getSiteSettings(),
  ]);

  const raffles = (data ?? []) as RaffleSummary[];
  const active = raffles.filter((r) => r.status !== "finished");
  const past = raffles.filter((r) => r.status === "finished").reverse();
  const banners = (bannerRows ?? []) as MediaItem[];
  const howto = resolveMedia(settings.howto_video_url);
  const hasVideo = Boolean(howto);

  return (
    <div className="container space-y-10 py-6 sm:py-10">
      {/* Banners del inicio */}
      {banners.length > 0 && (
        <MediaCarousel
          slides={banners.map((b) => ({ id: b.id, kind: b.kind, url: b.url, caption: b.caption, link_url: b.link_url }))}
          aspect="aspect-[16/9] sm:aspect-[21/8]"
          autoplayMs={6000}
          className="rounded-[2rem] border border-white/10"
        />
      )}

      {/* Presentación + video "cómo participar" */}
      <section
        className={cn(
          "relative overflow-hidden rounded-[2rem] border border-brand-400/20 bg-gradient-to-br from-zinc-950 via-red-950/40 to-black p-6 sm:p-10",
          hasVideo && "grid items-center gap-8 lg:grid-cols-2",
        )}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-red-700/20 blur-3xl" />
        <div className="relative max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200">
            <Sparkles className="h-3.5 w-3.5" /> Sorteos con la lotería oficial
          </span>
          <h1 className="font-display text-4xl font-black italic leading-[1.05] sm:text-5xl xl:text-6xl">
            Elige tu número y <span className="text-gradient">gana en grande</span>
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            {settings.tagline ??
              "Aparta tus puestos en segundos, sin registrarte, y paga como quieras: Nequi, Daviplata, Bre-B, Bancolombia o en efectivo. ¡También puedes abonar!"}
          </p>
          <div className="flex flex-wrap gap-4 pt-2 text-sm text-foreground/80">
            <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-brand-500" /> Números en tiempo real</span>
            <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-brand-500" /> Paga con QR</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand-500" /> Confirmación por WhatsApp</span>
          </div>
          <SocialLinks settings={settings} className="pt-2" />
        </div>
        {hasVideo && (
          <div className="relative space-y-2">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <PlayCircle className="h-5 w-5 text-brand-500" /> {settings.howto_title}
            </p>
            <MediaView item={{ kind: kindForLink(howto!), url: settings.howto_video_url! }} className="shadow-2xl" />
          </div>
        )}
      </section>

      <RaffleTabs active={active} past={past} />

      {/* Cómo participar, paso a paso */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-black italic sm:text-3xl">
          ¿Cómo <span className="text-gradient">participar</span>?
        </h2>
        <HowToSteps />
      </section>
    </div>
  );
}
