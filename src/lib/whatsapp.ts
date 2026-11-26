/**
 * WhatsApp Business Cloud API (oficial de Meta).
 * Si no hay credenciales, la app trabaja en "modo asistido" (enlaces wa.me).
 */

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v23.0";
const LANG = process.env.WHATSAPP_TEMPLATE_LANG ?? "es";

export const WA_TEMPLATES = {
  purchase_buyer: process.env.WA_TPL_PURCHASE_BUYER ?? "rifa_compra_confirmada",
  purchase_owner: process.env.WA_TPL_PURCHASE_OWNER ?? "rifa_nueva_reserva",
  payment_reminder: process.env.WA_TPL_PAYMENT_REMINDER ?? "rifa_recordatorio_pago",
  draw_reminder: process.env.WA_TPL_DRAW_REMINDER ?? "rifa_recordatorio_sorteo",
} as const;

export type WaTemplateKey = keyof typeof WA_TEMPLATES;

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Cómo se envían los mensajes:
 *  - "bot":    los deja en la bandeja (whatsapp_outbox) y el bot de tu PC los envía (WHATSAPP_PROVIDER=bot)
 *  - "api":    API oficial de Meta (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID)
 *  - "manual": modo asistido (abre WhatsApp con el mensaje escrito)
 */
export type WhatsAppMode = "bot" | "api" | "manual";
export function whatsappMode(): WhatsAppMode {
  if (process.env.WHATSAPP_PROVIDER === "bot") return "bot";
  return whatsappConfigured() ? "api" : "manual";
}

export interface OutboxRow {
  kind: "purchase_buyer" | "purchase_owner" | "payment_reminder" | "draw_reminder" | "manual";
  phone: string;
  body: string;
  raffle_id?: string | null;
  transaction_id?: string | null;
}

/** Deja mensajes en la bandeja de salida para el bot (requiere cliente con clave secreta) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queueWhatsApp(admin: { from: (t: string) => any }, rows: OutboxRow[]) {
  if (!rows.length) return { ok: true, count: 0 };
  const { error } = await admin.from("whatsapp_outbox").insert(
    rows.map((r) => ({ ...r, phone: r.phone.replace(/\D/g, "") })),
  );
  return { ok: !error, count: error ? 0 : rows.length, error: error?.message as string | undefined };
}

/** "300 123 4567" → "573001234567" */
export function toWaNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `57${digits}` : digits;
}

/** Meta no acepta saltos de línea, tabs ni >4 espacios seguidos en parámetros */
function cleanParam(value: string) {
  const v = String(value ?? "").replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (v || "-").slice(0, 900);
}

export interface WaResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendTemplate(phone: string, template: WaTemplateKey, params: string[]): Promise<WaResult> {
  if (!whatsappConfigured()) return { ok: false, error: "NOT_CONFIGURED" };
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toWaNumber(phone),
        type: "template",
        template: {
          name: WA_TEMPLATES[template],
          language: { code: LANG },
          components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: cleanParam(p) })) }],
        },
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "NETWORK_ERROR" };
  }
}

/** Ejecuta tareas con concurrencia limitada */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
