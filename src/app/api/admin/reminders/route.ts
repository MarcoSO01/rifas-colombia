import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  drawReminderMessage, paymentReminderMessage, type BuyerGroup, type RaffleInfo,
} from "@/lib/messages";
import { queueWhatsApp, runPool, sendTemplate, toWaNumber, whatsappMode } from "@/lib/whatsapp";
import { whatsappLink } from "@/lib/utils";
import type { TxStatus } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Kind = "payment_reminder" | "draw_reminder";
const DEDUPE_HOURS = 6;

/**
 * POST { raffleId, kind, dryRun?, force? }
 *  - payment_reminder → compradores con abono y saldo pendiente + reservas sin pagar (efectivo, sin comprobante)
 *  - draw_reminder    → todos los compradores activos (pagados, abonados y en verificación)
 */
export async function POST(req: Request) {
  // 1. Solo administradores
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { raffleId?: string; kind?: Kind; dryRun?: boolean; force?: boolean };
  const kind: Kind = body.kind === "draw_reminder" ? "draw_reminder" : "payment_reminder";
  if (!body.raffleId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const { data: raffle } = await admin
    .from("raffles")
    .select("id, title, total_numbers, draw_date, lottery_reference")
    .eq("id", body.raffleId)
    .single<RaffleInfo & { id: string }>();
  if (!raffle) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // 2. Destinatarios agrupados por celular (un mensaje por persona)
  const statuses: TxStatus[] = kind === "payment_reminder" ? ["partial", "pending"] : ["pending", "partial", "approved"];
  const { data: txs } = await admin
    .from("transactions")
    .select("buyer_name, buyer_phone, numbers, amount_total, amount_paid, status, receipt_path")
    .eq("raffle_id", raffle.id)
    .in("status", statuses);

  const groups = new Map<string, BuyerGroup>();
  let withoutPhone = 0;
  for (const t of txs ?? []) {
    // Deudores: abonos con saldo, o reservas pendientes SIN comprobante (aún no han pagado nada)
    if (kind === "payment_reminder" && t.status === "pending" && t.receipt_path) continue;
    const phone = String(t.buyer_phone ?? "").replace(/\D/g, "");
    if (!phone) {
      withoutPhone++;
      continue;
    }
    const g: BuyerGroup = groups.get(phone) ?? { name: t.buyer_name ?? "", phone, numbers: [], balance: 0 };
    g.numbers.push(...(t.numbers as number[]));
    if (t.status === "partial" || (t.status === "pending" && !t.receipt_path)) g.balance += Number(t.amount_total) - Number(t.amount_paid);
    groups.set(phone, g);
  }
  let recipients = [...groups.values()].map((g) => ({ ...g, numbers: [...new Set(g.numbers)].sort((a, b) => a - b) }));
  if (kind === "payment_reminder") recipients = recipients.filter((g) => g.balance > 0);

  // 3. Evitar duplicados recientes (salvo force)
  let skipped = 0;
  if (!body.force && recipients.length) {
    const since = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("phone")
      .eq("raffle_id", raffle.id)
      .eq("kind", kind)
      .eq("status", "sent")
      .gte("created_at", since);
    // En modo bot también cuentan los mensajes en cola o enviados desde la bandeja
    const { data: queued } = await admin
      .from("whatsapp_outbox")
      .select("phone")
      .eq("raffle_id", raffle.id)
      .eq("kind", kind)
      .in("status", ["queued", "sending", "sent"])
      .gte("created_at", since);
    const sentPhones = new Set([...(recent ?? []), ...(queued ?? [])].map((r) => String(r.phone).replace(/\D/g, "")));
    const before = recipients.length;
    recipients = recipients.filter((g) => !sentPhones.has(g.phone));
    skipped = before - recipients.length;
  }

  const build = kind === "payment_reminder" ? paymentReminderMessage : drawReminderMessage;
  const mode = whatsappMode();

  if (body.dryRun) {
    return NextResponse.json({ mode, count: recipients.length, skipped, withoutPhone });
  }

  // 4a. Bot de WhatsApp: se dejan en la bandeja y el bot los envía con pausas
  if (mode === "bot") {
    const q = await queueWhatsApp(
      admin,
      recipients.map((g) => ({ kind, phone: g.phone, body: build(g, raffle).text, raffle_id: raffle.id })),
    );
    if (!q.ok) return NextResponse.json({ error: q.error ?? "No se pudo poner en cola" }, { status: 500 });
    return NextResponse.json({ mode, queued: q.count, skipped, withoutPhone });
  }

  // 4b. Modo asistido: se devuelven los mensajes listos para abrir en WhatsApp
  if (mode === "manual") {
    return NextResponse.json({
      mode,
      skipped,
      withoutPhone,
      recipients: recipients.map((g) => {
        const { text } = build(g, raffle);
        return { name: g.name, phone: g.phone, text, link: whatsappLink(toWaNumber(g.phone), text) };
      }),
    });
  }

  // 4c. Envío automático por la API de WhatsApp
  const results = await runPool(recipients, 5, async (g) => {
    const { params } = build(g, raffle);
    const r = await sendTemplate(g.phone, kind, params);
    return { g, r };
  });

  await admin.from("notifications").insert(
    results.map(({ g, r }) => ({
      raffle_id: raffle.id, kind, phone: g.phone, status: r.ok ? "sent" : "failed",
      provider_id: r.id ?? null, error: r.error ?? null,
    })),
  );

  const failed = results.filter((x) => !x.r.ok);
  return NextResponse.json({
    mode,
    sent: results.length - failed.length,
    failed: failed.length,
    skipped,
    withoutPhone,
    errors: failed.slice(0, 5).map((x) => ({ name: x.g.name, phone: x.g.phone, error: x.r.error })),
  });
}
