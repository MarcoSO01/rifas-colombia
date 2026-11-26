import { formatCOP, formatDate, padNumber } from "@/lib/utils";

export interface ShareRaffle {
  title: string;
  slug: string;
  prize: string;
  ticket_price: number;
  total_numbers: number;
  draw_date: string | null;
  lottery_reference: string | null;
}

export function raffleUrl(base: string, slug: string) {
  return `${base.replace(/\/$/, "")}/rifas/${slug}`;
}

/** Texto listo para Facebook, Instagram, TikTok o WhatsApp */
export function buildShareCaption(r: ShareRaffle, url: string, hashtags?: string | null) {
  const lines = [
    `🎉 ¡GRAN SORTEO! ${r.title}`,
    `🏆 Premio: ${r.prize}`,
    `🎟️ Boleta: ${formatCOP(r.ticket_price)} · Números ${padNumber(0, r.total_numbers)} al ${padNumber(r.total_numbers - 1, r.total_numbers)}`,
    r.draw_date ? `🗓️ Sorteo: ${formatDate(r.draw_date)}` : null,
    r.lottery_reference ? `🎰 ${r.lottery_reference}` : null,
    `💳 Paga con Nequi, Daviplata, Bre-B, Bancolombia o efectivo. ¡También puedes abonar!`,
    ``,
    `👉 Aparta tus números aquí: ${url}`,
    hashtags ? `\n${hashtags}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}
