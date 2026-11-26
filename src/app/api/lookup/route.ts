import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/api-errors";

export const runtime = "nodejs";

/** Consulta de boletas por cédula + celular (ambos deben coincidir) */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { nationalId?: string; phone?: string };
  const id = String(body.nationalId ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  let phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length === 12 && phone.startsWith("57")) phone = phone.slice(2);
  if (id.length < 5 || !/^3\d{9}$/.test(phone)) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const key = "lookup:" + createHash("sha256").update(clientIp(req) + (process.env.RATE_LIMIT_SALT ?? "rifas")).digest("hex").slice(0, 32);
  const { data: allowed } = await admin.rpc("hit_rate_limit", { p_key: key, p_max: 15, p_window_minutes: 10 });
  if (allowed === false) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const { data } = await admin
    .from("transactions")
    .select(
      "id, code, numbers, method, plan, amount_total, amount_declared, amount_paid, status, expires_at, admin_note, created_at, buyer_name, raffles(title, slug, total_numbers, draw_date, status, winner_number)",
    )
    .eq("buyer_national_id", id)
    .eq("buyer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ orders: data ?? [] });
}
