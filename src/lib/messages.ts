import { METHOD_LABEL, type PayMethod, type PayPlan } from "@/lib/types";
import { formatCOP, formatDate, padNumber } from "@/lib/utils";

/**
 * Cada mensaje devuelve:
 *  - params: valores {{1}}, {{2}}… para la plantilla aprobada en Meta (en el MISMO orden)
 *  - text:   el mismo mensaje en texto libre, para enviar con wa.me (modo asistido)
 *
 * Las plantillas que debes crear en Meta están en el README (sección WhatsApp).
 */

export interface RaffleInfo {
  title: string;
  total_numbers: number;
  draw_date: string | null;
  lottery_reference: string | null;
}

export const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "participante";
export const numbersText = (nums: number[], total: number) => nums.map((n) => padNumber(n, total)).join(", ");
const drawText = (r: RaffleInfo) => (r.draw_date ? formatDate(r.draw_date) : "fecha por confirmar");

export function consultUrl() {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/consultar`;
}

export interface OrderInfo {
  code: string;
  numbers: number[];
  method: PayMethod;
  plan: PayPlan;
  amount_total: number;
  amount_declared: number;
  buyer_name: string | null;
  buyer_national_id: string | null;
  buyer_phone: string | null;
}

function amountText(o: OrderInfo) {
  return o.plan === "partial"
    ? `${formatCOP(o.amount_declared)} de abono (total ${formatCOP(o.amount_total)})`
    : formatCOP(o.amount_total);
}

/** Plantilla rifa_compra_confirmada (7 parámetros) → al comprador */
export function purchaseBuyerMessage(o: OrderInfo, r: RaffleInfo) {
  const nums = numbersText(o.numbers, r.total_numbers);
  const params = [firstName(o.buyer_name), r.title, nums, amountText(o), o.code, drawText(r), consultUrl()];
  const text =
    `Hola ${params[0]} 👋 Recibimos tu reserva en la rifa *${r.title}*.\n` +
    `🎟️ Números: ${nums}\n💰 Valor: ${params[3]}\n📌 Código de reserva: ${o.code}\n🗓️ Sorteo: ${params[5]}\n` +
    `Tus números quedan en verificación hasta que confirmemos el pago. Consulta su estado aquí: ${params[6]} ¡Mucha suerte!`;
  return { params, text };
}

/** Plantilla rifa_nueva_reserva (7 parámetros) → al organizador */
export function purchaseOwnerMessage(o: OrderInfo, r: RaffleInfo) {
  const nums = numbersText(o.numbers, r.total_numbers);
  const payment = `${METHOD_LABEL[o.method]} · ${amountText(o)}`;
  const params = [o.code, r.title, o.buyer_name ?? "-", o.buyer_national_id ?? "-", o.buyer_phone ?? "-", nums, payment];
  const text =
    `🔔 Nueva reserva ${o.code} en *${r.title}*\n` +
    `👤 ${params[2]} · C.C. ${params[3]} · Cel. ${params[4]}\n🎟️ Números: ${nums}\n💰 ${payment}\n` +
    `Revísala en el panel de administración.`;
  return { params, text };
}

export interface BuyerGroup {
  name: string;
  phone: string;
  numbers: number[];
  balance: number;
}

/** Plantilla rifa_recordatorio_pago (5 parámetros) */
export function paymentReminderMessage(g: BuyerGroup, r: RaffleInfo) {
  const nums = numbersText(g.numbers, r.total_numbers);
  const params = [firstName(g.name), r.title, formatCOP(g.balance), nums, drawText(r)];
  const text =
    `Hola ${params[0]}, te recordamos que en la rifa *${r.title}* tienes un saldo pendiente de ${params[2]} por los números ${nums}.\n` +
    `🗓️ Sorteo: ${params[4]}\nCompleta tu pago para asegurar tu participación. ¡Gracias!`;
  return { params, text };
}

/** Plantilla rifa_recordatorio_sorteo (5 parámetros) */
export function drawReminderMessage(g: BuyerGroup, r: RaffleInfo) {
  const nums = numbersText(g.numbers, r.total_numbers);
  const extra = [
    r.lottery_reference ? `Juega con: ${r.lottery_reference}.` : "",
    g.balance > 0 ? `Recuerda tu saldo pendiente de ${formatCOP(g.balance)}.` : "",
  ].filter(Boolean).join(" ") || "¡Estate pendiente de los resultados!";
  const params = [firstName(g.name), r.title, drawText(r), nums, extra];
  const text =
    `Hola ${params[0]} 🍀 ¡Se acerca el sorteo de *${r.title}*!\n🗓️ ${params[2]}\n🎟️ Tus números: ${nums}\n${extra}\n¡Mucha suerte!`;
  return { params, text };
}
