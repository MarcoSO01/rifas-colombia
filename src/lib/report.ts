import type { PayMethod, PayPlan, RaffleStatus, TicketStatus, TxStatus } from "@/lib/types";
import { METHOD_LABEL, RAFFLE_STATUS_LABEL, TX_STATUS_LABEL } from "@/lib/types";
import { formatCOP, padNumber } from "@/lib/utils";
import type { Cell, Sheet } from "@/lib/xlsx";

export interface ReportRaffle {
  id: string;
  title: string;
  slug: string;
  ticket_price: number;
  total_numbers: number;
  draw_date: string | null;
  status: RaffleStatus;
}

export interface ReportTx {
  id: string;
  code: string;
  raffle_id: string;
  created_at: string;
  buyer_name: string | null;
  buyer_national_id: string | null;
  buyer_phone: string | null;
  numbers: number[];
  method: PayMethod;
  plan: PayPlan;
  amount_total: number;
  amount_declared: number;
  amount_paid: number;
  status: TxStatus;
  expires_at: string | null;
  is_manual: boolean;
  admin_note: string | null;
}

export interface ReportPayment {
  transaction_id: string;
  amount: number;
  method: PayMethod | null;
  note: string | null;
  created_at: string;
}

export interface ReportTicket {
  raffle_id: string;
  number: number;
  status: TicketStatus;
  transaction_id: string | null;
}

const TICKET_LABEL: Record<TicketStatus, string> = {
  available: "Disponible", pending: "En verificación", partial: "Con abono", paid: "Pagado",
};

const ACTIVE: TxStatus[] = ["pending", "partial", "approved"];
const d = (iso: string | null) => (iso ? new Date(iso) : null);
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso));

export function buildRaffleReport(input: {
  raffles: ReportRaffle[];
  txs: ReportTx[];
  payments: ReportPayment[];
  tickets?: ReportTicket[];
}): Sheet[] {
  const { raffles, txs, payments, tickets = [] } = input;
  const raffleById = new Map(raffles.map((r) => [r.id, r]));
  const multi = raffles.length > 1;

  // Abonos agrupados por orden, en orden cronológico
  const payByTx = new Map<string, ReportPayment[]>();
  for (const p of [...payments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const list = payByTx.get(p.transaction_id) ?? [];
    list.push(p);
    payByTx.set(p.transaction_id, list);
  }

  const sortedTxs = [...txs].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // ------------------------------------------------------------ Ventas
  const ventas: Sheet = {
    name: "Ventas",
    columns: [
      { header: "Fecha de compra", width: 17, style: "datetime" },
      { header: "Código", width: 11 },
      ...(multi ? [{ header: "Rifa", width: 22 }] : []),
      { header: "Comprador", width: 26 },
      { header: "Cédula", width: 14 },
      { header: "Celular", width: 13 },
      { header: "Números", width: 22, style: "wrap" as const },
      { header: "Cant.", width: 7, style: "int" as const },
      { header: "Medio de pago", width: 16 },
      { header: "Tipo de pago", width: 13 },
      { header: "Valor total", width: 13, style: "money" as const },
      { header: "Abono declarado", width: 14, style: "money" as const },
      { header: "Pagado (confirmado)", width: 15, style: "money" as const },
      { header: "Saldo pendiente", width: 14, style: "money" as const },
      { header: "N° de cuotas", width: 9, style: "int" as const },
      { header: "Detalle de abonos", width: 46, style: "wrap" as const },
      { header: "Último pago", width: 17, style: "datetime" as const },
      { header: "Estado", width: 15 },
      { header: "Venta manual", width: 9 },
      { header: "Nota", width: 30, style: "wrap" as const },
    ],
    rows: [],
  };

  let tTotal = 0, tPaid = 0, tBalance = 0;
  for (const t of sortedTxs) {
    const r = raffleById.get(t.raffle_id);
    const total = r?.total_numbers ?? 100;
    const list = payByTx.get(t.id) ?? [];
    const active = ACTIVE.includes(t.status);
    const balance = active ? Math.max(Number(t.amount_total) - Number(t.amount_paid), 0) : 0;
    const detail = list
      .map((p, i) => `${i + 1}) ${shortDate(p.created_at)} · ${formatCOP(p.amount)} · ${p.method ? METHOD_LABEL[p.method] : "—"}`)
      .join("\n");
    if (active) {
      tTotal += Number(t.amount_total);
      tPaid += Number(t.amount_paid);
      tBalance += balance;
    }
    ventas.rows.push([
      d(t.created_at),
      t.code,
      ...(multi ? [r?.title ?? ""] : []),
      t.buyer_name ?? "",
      t.buyer_national_id ?? "",
      t.buyer_phone ?? "",
      t.numbers.map((n) => padNumber(n, total)).join(", "),
      t.numbers.length,
      METHOD_LABEL[t.method],
      t.plan === "partial" ? "Abono" : "Completo",
      Number(t.amount_total),
      t.plan === "partial" ? Number(t.amount_declared) : null,
      Number(t.amount_paid),
      balance,
      list.length,
      detail || (t.status === "pending" ? "Pago en verificación" : ""),
      list.length ? d(list[list.length - 1].created_at) : null,
      TX_STATUS_LABEL[t.status],
      t.is_manual,
      t.admin_note ?? "",
    ]);
  }
  const off = multi ? 1 : 0;
  const footerRow: Cell[] = new Array(ventas.columns.length).fill(null);
  footerRow[0] = { v: "TOTAL (activas)", s: "bold" };
  footerRow[10 + off] = { v: tTotal, s: "moneyBold" };
  footerRow[12 + off] = { v: tPaid, s: "moneyBold" };
  footerRow[13 + off] = { v: tBalance, s: "moneyBold" };
  ventas.footer = [footerRow];

  // ------------------------------------------------------------ Abonos (cada pago / cuota)
  const txById = new Map(txs.map((t) => [t.id, t]));
  const abonos: Sheet = {
    name: "Abonos y pagos",
    columns: [
      { header: "Fecha del pago", width: 17, style: "datetime" },
      { header: "Código", width: 11 },
      ...(multi ? [{ header: "Rifa", width: 22 }] : []),
      { header: "Comprador", width: 26 },
      { header: "Cédula", width: 14 },
      { header: "Celular", width: 13 },
      { header: "Cuota N°", width: 9, style: "int" as const },
      { header: "Valor", width: 13, style: "money" as const },
      { header: "Medio", width: 16 },
      { header: "Acumulado", width: 13, style: "money" as const },
      { header: "Saldo después", width: 13, style: "money" as const },
      { header: "Valor total boleta(s)", width: 15, style: "money" as const },
      { header: "Nota", width: 30, style: "wrap" as const },
    ],
    rows: [],
  };
  let sumPayments = 0;
  for (const t of sortedTxs) {
    const list = payByTx.get(t.id) ?? [];
    let acc = 0;
    list.forEach((p, i) => {
      acc += Number(p.amount);
      sumPayments += Number(p.amount);
      abonos.rows.push([
        d(p.created_at),
        t.code,
        ...(multi ? [raffleById.get(t.raffle_id)?.title ?? ""] : []),
        t.buyer_name ?? "",
        t.buyer_national_id ?? "",
        t.buyer_phone ?? "",
        i + 1,
        Number(p.amount),
        p.method ? METHOD_LABEL[p.method] : "",
        acc,
        Math.max(Number(t.amount_total) - acc, 0),
        Number(t.amount_total),
        p.note ?? "",
      ]);
    });
  }
  const abFooter: Cell[] = new Array(abonos.columns.length).fill(null);
  abFooter[0] = { v: "TOTAL RECIBIDO", s: "bold" };
  abFooter[6 + off] = { v: sumPayments, s: "moneyBold" };
  abonos.footer = [abFooter];

  // ------------------------------------------------------------ Resumen por rifa
  const resumen: Sheet = {
    name: "Resumen",
    columns: [
      { header: "Rifa", width: 28 },
      { header: "Estado", width: 12 },
      { header: "Fecha del sorteo", width: 17, style: "datetime" },
      { header: "Precio boleta", width: 13, style: "money" },
      { header: "Total números", width: 10, style: "int" },
      { header: "Pagados", width: 9, style: "int" },
      { header: "Con abono", width: 9, style: "int" },
      { header: "En verificación", width: 11, style: "int" },
      { header: "Disponibles", width: 10, style: "int" },
      { header: "Compradores", width: 13, style: "int" },
      { header: "Recaudado (confirmado)", width: 16, style: "money" },
      { header: "Saldo por cobrar", width: 15, style: "money" },
      { header: "Valor en verificación", width: 16, style: "money" },
      { header: "Recaudo potencial (todo vendido)", width: 20, style: "money" },
    ],
    rows: raffles.map((r) => {
      const rt = txs.filter((t) => t.raffle_id === r.id);
      const act = rt.filter((t) => ACTIVE.includes(t.status));
      const count = (st: TxStatus) => rt.filter((t) => t.status === st).reduce((a, t) => a + t.numbers.length, 0);
      const paidN = count("approved"), partialN = count("partial"), pendingN = count("pending");
      const buyers = new Set(act.map((t) => t.buyer_phone || t.buyer_national_id || t.id)).size;
      return [
        r.title,
        RAFFLE_STATUS_LABEL[r.status],
        d(r.draw_date),
        Number(r.ticket_price),
        r.total_numbers,
        paidN,
        partialN,
        pendingN,
        Math.max(r.total_numbers - paidN - partialN - pendingN, 0),
        buyers,
        act.reduce((a, t) => a + Number(t.amount_paid), 0),
        act.filter((t) => t.status === "partial").reduce((a, t) => a + Number(t.amount_total) - Number(t.amount_paid), 0),
        act.filter((t) => t.status === "pending").reduce((a, t) => a + Number(t.amount_declared), 0),
        Number(r.ticket_price) * r.total_numbers,
      ];
    }),
  };

  const sheets: Sheet[] = [resumen, ventas, abonos];

  // ------------------------------------------------------------ Números (para el día del sorteo)
  if (!multi && raffles[0] && tickets.length) {
    const r = raffles[0];
    sheets.push({
      name: "Números",
      columns: [
        { header: "Número", width: 9 },
        { header: "Estado", width: 15 },
        { header: "Comprador", width: 26 },
        { header: "Cédula", width: 14 },
        { header: "Celular", width: 13 },
        { header: "Código", width: 11 },
        { header: "Saldo pendiente", width: 14, style: "money" },
      ],
      rows: [...tickets]
        .sort((a, b) => a.number - b.number)
        .map((tk) => {
          const t = tk.transaction_id ? txById.get(tk.transaction_id) : undefined;
          return [
            padNumber(tk.number, r.total_numbers),
            TICKET_LABEL[tk.status],
            t?.buyer_name ?? "",
            t?.buyer_national_id ?? "",
            t?.buyer_phone ?? "",
            t?.code ?? "",
            t && tk.status === "partial" ? Number(t.amount_total) - Number(t.amount_paid) : null,
          ];
        }),
    });
  }

  return sheets;
}
