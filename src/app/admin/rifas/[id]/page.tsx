import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Raffle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { RaffleForm } from "@/components/admin/raffle-form";
import { ManualSale } from "@/components/admin/manual-sale";
import { MediaManager } from "@/components/admin/media-manager";
import { RemindersCard } from "@/components/admin/reminders-card";
import { AdminLiveStats } from "@/components/admin/admin-live-stats";
import { ReportButton } from "@/components/admin/report-button";
import { SocialShareCard } from "@/components/admin/social-share-card";
import { getSiteSettings } from "@/lib/settings";

export const metadata = { title: "Admin · Gestionar rifa" };

export default async function EditRafflePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: raffle } = await supabase.from("raffles").select("*").eq("id", id).maybeSingle<Raffle>();
  if (!raffle) notFound();
  const settings = await getSiteSettings();
  const facebookConfigured = Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-black italic">{raffle.title}</h2>
        <div className="flex flex-wrap gap-2">
          <ReportButton raffleId={raffle.id} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/rifas/${raffle.slug}`} target="_blank"><ExternalLink /> Ver página pública</Link>
          </Button>
        </div>
      </div>
      <AdminLiveStats raffleId={raffle.id} total={raffle.total_numbers} />
      <div className="grid gap-6 xl:grid-cols-2">
        <RaffleForm raffle={raffle} />
        <div className="space-y-6">
          <SocialShareCard raffle={raffle} settings={settings} facebookConfigured={facebookConfigured} />
          {raffle.status !== "finished" && <RemindersCard raffleId={raffle.id} />}
          {raffle.status !== "finished" && <ManualSale raffle={raffle} />}
        </div>
      </div>
      <MediaManager
        raffleId={raffle.id}
        placements={["gallery", "rules", "side_left", "side_right"]}
        title="Fotos, videos, PDF y banners de esta rifa"
        description="Galería: recuadro del premio. ¿Cómo se juega?: sección para explicar la metodología con video, PDF del reglamento o imagen. Banners laterales: a los lados en computador y debajo en celular. Puedes subir archivos o pegar enlaces de YouTube, TikTok, Instagram, Facebook o Drive."
      />
    </div>
  );
}
