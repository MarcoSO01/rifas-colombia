/* Imagen para redes y vista previa de enlaces (se renderiza con next/og) */
import type { ShareRaffle } from "@/lib/share";
import { formatCOP, formatDate, padNumber } from "@/lib/utils";


export type CardFormat = "og" | "square" | "story";
export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const RED = "#e10600";

/** Descarga una imagen y la devuelve como data URL (solo PNG/JPEG/GIF, que es lo que soporta el generador) */
export async function loadImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/png", "image/jpeg", "image/gif"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Fuente Exo 2 desde Google Fonts (si falla se usa la fuente por defecto) */
export async function loadFonts(text: string) {
  const load = async (weight: number) => {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Exo+2:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) throw new Error("font");
    return (await fetch(src[1])).arrayBuffer();
  };
  try {
    const [black, semi] = await Promise.all([load(900), load(600)]);
    return [
      { name: "Exo", data: black, weight: 900 as const, style: "normal" as const },
      { name: "Exo", data: semi, weight: 600 as const, style: "normal" as const },
    ];
  } catch {
    return undefined;
  }
}

export function cardText(r: ShareRaffle, host: string, brand: string) {
  return `${r.title}${r.prize}${brand}${host}SORTEOBoletaSorteoAparta tus números en0123456789$.,:–-/áéíóúñÁÉÍÓÚÑ ${r.lottery_reference ?? ""}${r.draw_date ? formatDate(r.draw_date) : ""}`;
}

interface CardProps {
  raffle: ShareRaffle;
  format: CardFormat;
  logo: string | null;
  image: string | null;
  brand: string;
  host: string;
}

// Medidas por formato (ajustadas para que nada se salga)
const DIM = {
  og: { pad: 44, logo: 64, prize: 50, title: 24, pillLabel: 17, pillValue: 28, pillPad: "8px 16px", tag: 20, footer: 22, host: 26, photo: 0, gap: 12, lottery: false },
  square: { pad: 56, logo: 90, prize: 62, title: 30, pillLabel: 20, pillValue: 36, pillPad: "10px 22px", tag: 26, footer: 26, host: 34, photo: 330, gap: 16, lottery: false },
  story: { pad: 70, logo: 150, prize: 96, title: 40, pillLabel: 26, pillValue: 50, pillPad: "18px 28px", tag: 34, footer: 32, host: 42, photo: 820, gap: 26, lottery: true },
} as const;

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso));

export function ShareCard({ raffle: r, format, logo, image, brand, host }: CardProps) {
  const { width, height } = CARD_SIZE[format];
  const og = format === "og";
  const story = format === "story";
  const D = DIM[format];
  const pad = D.pad;
  // Premios con nombre largo: letra más pequeña
  const len = r.prize.length;
  const prizeSize = Math.round(D.prize * (len > 45 ? 0.68 : len > 28 ? 0.82 : 1));
  const range = `${padNumber(0, r.total_numbers)}–${padNumber(r.total_numbers - 1, r.total_numbers)}`;

  const pill = (label: string, value: string, filled = false) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: D.pillPad,
        borderRadius: 20,
        background: filled ? RED : "rgba(255,255,255,0.08)",
        border: filled ? "none" : "2px solid rgba(255,255,255,0.15)",
      }}
    >
      <span style={{ fontSize: D.pillLabel, fontWeight: 600, color: filled ? "#ffe0e0" : "#bbbbbb" }}>{label}</span>
      <span style={{ fontSize: D.pillValue, fontWeight: 900, color: "#fff" }}>{value}</span>
    </div>
  );

  const header = logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" height={D.logo} width={Math.round(D.logo * 3.4)} style={{ objectFit: "contain", objectPosition: og ? "left" : "center" }} />
  ) : (
    <span style={{ fontSize: Math.round(D.logo * 0.55), fontWeight: 900, color: "#fff" }}>{brand}</span>
  );

  const photo = (w: number, h: number) =>
    image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={w} height={h} style={{ objectFit: "cover", borderRadius: 32, border: `4px solid ${RED}` }} />
    ) : (
      <div style={{ display: "flex", width: w, height: h, borderRadius: 32, background: "linear-gradient(135deg,#1a1a1a,#000)", alignItems: "center", justifyContent: "center", border: `4px solid ${RED}`, fontSize: 140 }}>
        🎁
      </div>
    );

  const info = (
    <div style={{ display: "flex", flexDirection: "column", gap: D.gap }}>
      <div style={{ display: "flex" }}>
        <span style={{ background: RED, color: "#fff", fontSize: D.tag, fontWeight: 900, padding: "4px 18px", borderRadius: 999, letterSpacing: 4 }}>
          SORTEO
        </span>
      </div>
      <span style={{ fontSize: prizeSize, fontWeight: 900, color: "#fff", lineHeight: 1.02, textTransform: "uppercase" }}>{r.prize}</span>
      <span style={{ fontSize: D.title, fontWeight: 600, color: "#cfcfcf" }}>{r.title}</span>
      <div style={{ display: "flex", gap: 12 }}>
        {pill("Boleta", formatCOP(r.ticket_price), true)}
        {pill("Números", range)}
        {r.draw_date ? pill("Sorteo", shortDate(r.draw_date)) : null}
      </div>
      {D.lottery && r.lottery_reference ? (
        <span style={{ fontSize: 30, fontWeight: 600, color: "#e5e5e5" }}>🎰 {r.lottery_reference}</span>
      ) : null}
    </div>
  );

  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `3px solid ${RED}`, paddingTop: D.gap }}>
      <span style={{ fontSize: D.footer, fontWeight: 600, color: "#bbbbbb" }}>Aparta tus números en</span>
      <span style={{ fontSize: D.host, fontWeight: 900, color: "#fff" }}>{host}</span>
    </div>
  );

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: og ? "row" : "column",
        background: "#050505",
        backgroundImage: "radial-gradient(circle at 15% 0%, rgba(225,6,0,0.55), transparent 55%), radial-gradient(circle at 100% 100%, rgba(225,6,0,0.35), transparent 50%)",
        padding: pad,
        gap: og ? 36 : D.gap + 8,
        fontFamily: "Exo",
        color: "#fff",
      }}
    >
      {/* Sin fragmentos (<>): el generador de imágenes los trata como una caja en fila */}
      {og
        ? [
            <div key="photo" style={{ display: "flex" }}>{photo(height - pad * 2, height - pad * 2)}</div>,
            <div key="info" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
              {header}
              {info}
              {footer}
            </div>,
          ]
        : [
            <div key="head" style={{ display: "flex", justifyContent: "center" }}>{header}</div>,
            <div key="photo" style={{ display: "flex" }}>{photo(width - pad * 2, D.photo)}</div>,
            <div key="info" style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
              {info}
              {footer}
            </div>,
          ]}
    </div>
  );
}
