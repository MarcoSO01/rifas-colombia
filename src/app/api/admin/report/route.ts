import { createClient } from "@/lib/supabase/server";
import { buildXlsx } from "@/lib/xlsx";
import { buildRaffleReport, type ReportPayment, type ReportRaffle, type ReportTicket, type ReportTx } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = 1000;

/** Trae todas las filas paginando (la API devuelve máx. 1000 por consulta) */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !Array.isArray(data)) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

/** GET /api/admin/report?raffleId=<id|all> → archivo .xlsx */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return new Response("No autorizado", { status: 403 });

  const raffleId = new URL(req.url).searchParams.get("raffleId") ?? "all";
  const single = raffleId !== "all";

  let rq = supabase.from("raffles").select("id, title, slug, ticket_price, total_numbers, draw_date, status").order("created_at");
  if (single) rq = rq.eq("id", raffleId);
  const { data: raffles } = await rq;
  if (!raffles?.length) return new Response("Rifa no encontrada", { status: 404 });

  const txCols =
    "id, code, raffle_id, created_at, buyer_name, buyer_national_id, buyer_phone, numbers, method, plan, amount_total, amount_declared, amount_paid, status, expires_at, is_manual, admin_note";

  const [txs, payments, tickets] = await Promise.all([
    fetchAll<ReportTx>((a, b) => {
      let q = supabase.from("transactions").select(txCols).order("created_at").range(a, b);
      if (single) q = q.eq("raffle_id", raffleId);
      return q;
    }),
    fetchAll<ReportPayment & { transactions?: unknown }>((a, b) => {
      let q = supabase
        .from("transaction_payments")
        .select("transaction_id, amount, method, note, created_at, transactions!inner(raffle_id)")
        .order("created_at")
        .range(a, b);
      if (single) q = q.eq("transactions.raffle_id", raffleId);
      return q;
    }),
    single
      ? fetchAll<ReportTicket>((a, b) =>
          supabase.from("tickets").select("raffle_id, number, status, transaction_id").eq("raffle_id", raffleId).order("number").range(a, b),
        )
      : Promise.resolve([] as ReportTicket[]),
  ]);

  const file = buildXlsx(
    buildRaffleReport({ raffles: raffles as ReportRaffle[], txs, payments, tickets }),
  );

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const name = `reporte-${single ? (raffles[0] as ReportRaffle).slug : "todas-las-rifas"}-${today}.xlsx`;

  return new Response(file as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
