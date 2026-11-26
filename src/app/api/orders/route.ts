import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, publicErrorCode } from "@/lib/api-errors";
import { purchaseBuyerMessage, purchaseOwnerMessage, type RaffleInfo } from "@/lib/messages";
import { queueWhatsApp, sendTemplate, whatsappMode } from "@/lib/whatsapp";
import { mergeSettings } from "@/lib/settings";
import type { PayMethod, SiteSettings, Transaction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vercel limita el cuerpo de la petición a ~4.5 MB
const MAX_FILE = 4 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};
const METHODS: PayMethod[] = ["nequi", "daviplata", "breb", "bancolombia", "cash"];

const fail = (code: string, status = 400) => NextResponse.json({ error: code }, { status });

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return fail("SERVER_NOT_CONFIGURED", 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("INVALID_REQUEST");
  }

  const raffleId = String(form.get("raffleId") ?? "");
  const method = String(form.get("method") ?? "") as PayMethod;
  const plan = form.get("plan") === "partial" ? "partial" : "full";
  const amountDeclared = Number(form.get("amountDeclared") ?? 0) || null;
  const name = String(form.get("name") ?? "");
  const nationalId = String(form.get("nationalId") ?? "");
  const phone = String(form.get("phone") ?? "");
  let numbers: number[] = [];
  try {
    numbers = JSON.parse(String(form.get("numbers") ?? "[]"));
  } catch {}

  if (!/^[0-9a-f-]{36}$/i.test(raffleId) || !METHODS.includes(method)) return fail("INVALID_REQUEST");
  if (!Array.isArray(numbers) || !numbers.length || !numbers.every((n) => Number.isInteger(n) && n >= 0)) return fail("NO_NUMBERS");
  if (form.get("consent") !== "true") return fail("CONSENT_REQUIRED");

  // Anti-abuso: máx. 8 intentos de compra cada 10 min por IP
  const ipKey = "order:" + createHash("sha256").update(clientIp(req) + (process.env.RATE_LIMIT_SALT ?? "rifas")).digest("hex").slice(0, 32);
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: ipKey, p_max: 8, p_window_minutes: 10 });
  if (allowed === false) return fail("RATE_LIMITED", 429);

  // Comprobante (privado)
  let receiptPath: string | null = null;
  if (method !== "cash") {
    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0) return fail("RECEIPT_REQUIRED");
    if (file.size > MAX_FILE) return fail("FILE_TOO_LARGE");
    const ext = FILE_TYPES[file.type];
    if (!ext) return fail("INVALID_FILE");
    receiptPath = `guest/${raffleId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await admin.storage.from("receipts").upload(receiptPath, file, { contentType: file.type });
    if (upErr) return fail("INVALID_FILE");
  }

  const { data: tx, error } = await admin
    .rpc("create_guest_order", {
      p_raffle_id: raffleId,
      p_numbers: numbers,
      p_method: method,
      p_plan: plan,
      p_amount_declared: plan === "partial" ? amountDeclared : null,
      p_receipt_path: receiptPath,
      p_buyer_name: name,
      p_buyer_national_id: nationalId,
      p_buyer_phone: phone,
    })
    .single<Transaction>();

  if (error || !tx) {
    if (receiptPath) await admin.storage.from("receipts").remove([receiptPath]);
    return fail(publicErrorCode(error?.message), 400);
  }

  // ----- Mensajes de WhatsApp (nunca bloquean la compra) -----
  const [{ data: raffle }, { data: settingsRow }] = await Promise.all([
    admin.from("raffles").select("title, total_numbers, draw_date, lottery_reference").eq("id", tx.raffle_id).single<RaffleInfo>(),
    admin.from("site_settings").select("*").eq("id", 1).maybeSingle<SiteSettings>(),
  ]);
  const settings = mergeSettings(settingsRow);
  const ownerPhone = settings.owner_whatsapp;
  const buyerMsg = raffle ? purchaseBuyerMessage(tx, raffle) : null;
  const ownerMsg = raffle ? purchaseOwnerMessage(tx, raffle) : null;

  let buyerSent = false;
  let ownerSent = false;
  const mode = whatsappMode();
  if (mode === "bot" && buyerMsg && ownerMsg) {
    // El bot de WhatsApp (en tu PC) los envía en segundos
    const q = await queueWhatsApp(admin, [
      { kind: "purchase_buyer", phone: tx.buyer_phone!, body: buyerMsg.text, raffle_id: tx.raffle_id, transaction_id: tx.id },
      ...(ownerPhone ? [{ kind: "purchase_owner" as const, phone: ownerPhone, body: ownerMsg.text, raffle_id: tx.raffle_id, transaction_id: tx.id }] : []),
    ]);
    buyerSent = q.ok;
    ownerSent = q.ok && Boolean(ownerPhone);
  } else if (mode === "api" && buyerMsg && ownerMsg) {
    const [b, o] = await Promise.all([
      sendTemplate(tx.buyer_phone!, "purchase_buyer", buyerMsg.params),
      ownerPhone ? sendTemplate(ownerPhone, "purchase_owner", ownerMsg.params) : Promise.resolve(null),
    ]);
    buyerSent = b.ok;
    ownerSent = Boolean(o?.ok);
    const logs = [
      { raffle_id: tx.raffle_id, transaction_id: tx.id, kind: "purchase_buyer", phone: tx.buyer_phone, status: b.ok ? "sent" : "failed", provider_id: b.id ?? null, error: b.error ?? null },
      ...(o ? [{ raffle_id: tx.raffle_id, transaction_id: tx.id, kind: "purchase_owner", phone: ownerPhone, status: o.ok ? "sent" : "failed", provider_id: o.id ?? null, error: o.error ?? null }] : []),
    ];
    await admin.from("notifications").insert(logs);
  }

  return NextResponse.json({
    tx: {
      id: tx.id, code: tx.code, created_at: tx.created_at, raffle_id: tx.raffle_id, numbers: tx.numbers, method: tx.method, plan: tx.plan,
      amount_total: tx.amount_total, amount_declared: tx.amount_declared, amount_paid: tx.amount_paid,
      status: tx.status, expires_at: tx.expires_at, buyer_name: tx.buyer_name,
    },
    whatsapp: {
      mode,
      buyerSent,
      ownerSent,
      buyerText: buyerMsg?.text ?? null,
      ownerText: ownerMsg?.text ?? null,
      ownerPhone,
    },
  });
}
