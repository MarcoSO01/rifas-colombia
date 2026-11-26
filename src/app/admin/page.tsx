import { createClient } from "@/lib/supabase/server";
import { ReservationsPanel } from "@/components/admin/reservations-panel";
import { BotStatusCard } from "@/components/admin/bot-status-card";
import { whatsappMode } from "@/lib/whatsapp";

export const metadata = { title: "Admin · Reservas" };

export default async function AdminHome() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("raffles")
    .select("id, title, total_numbers, status")
    .order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      {whatsappMode() === "bot" && <BotStatusCard />}
      <ReservationsPanel raffles={data ?? []} />
    </div>
  );
}
