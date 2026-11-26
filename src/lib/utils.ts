import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const formatCOP = (value: number | string | null | undefined) => copFormatter.format(Number(value ?? 0));

/** 100 números → 00-99 · 1000 → 000-999 */
export const digitsFor = (total: number) => String(Math.max(total - 1, 0)).length;
export const padNumber = (n: number, total: number) => String(n).padStart(digitsFor(total), "0");

export function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "Por definir";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Normaliza celular colombiano: "300 123 4567" → "3001234567" */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) return digits.slice(2);
  return digits;
}

export const isValidCoPhone = (phone: string) => /^3\d{9}$/.test(normalizePhone(phone));

export function whatsappLink(phone: string, text: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `57${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function ageFrom(birthDate: string) {
  const b = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Extrae el ID de un enlace de YouTube (watch, youtu.be, shorts, embed, live) */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.trim().match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

const ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Debes iniciar sesión con Google para continuar.",
  PROFILE_INCOMPLETE: "Completa tu perfil (nombre, WhatsApp, fecha de nacimiento y autorización de datos).",
  UNDERAGE: "Debes ser mayor de 18 años para participar.",
  RAFFLE_NOT_AVAILABLE: "Esta rifa no está disponible en este momento.",
  RAFFLE_CLOSED: "La venta de esta rifa ya cerró.",
  NO_NUMBERS: "Selecciona al menos un número.",
  TOO_MANY_NUMBERS: "Superaste el máximo de números por compra.",
  RECEIPT_REQUIRED: "Adjunta el comprobante de la transferencia.",
  INVALID_RECEIPT: "El comprobante no es válido. Vuelve a subirlo.",
  TOO_MANY_PENDING: "Tienes 3 reservas pendientes en esta rifa. Espera a que sean verificadas.",
  NUMBERS_TAKEN: "Uno o más números acaban de ser apartados por otra persona. Elige otros.",
  INVALID_PARTIAL_AMOUNT: "El abono debe ser mayor a $0 y menor al total.",
  PARTIAL_TOO_LOW: "El abono es menor al mínimo permitido para esta rifa.",
  FORBIDDEN: "No tienes permisos para esta acción.",
  INVALID_STATE: "Esta reserva ya fue procesada. Actualiza la página.",
  INVALID_AMOUNT: "Monto inválido.",
  NOT_FOUND: "No encontramos el registro.",
  BUYER_REQUIRED: "Escribe el nombre del comprador.",
  CANNOT_SHRINK: "No puedes reducir los números: hay boletas vendidas o reservadas en ese rango.",
  INVALID_BUYER_NAME: "Escribe tu nombre completo (nombre y apellido).",
  INVALID_BUYER_ID: "Revisa el número de identificación.",
  INVALID_BUYER_PHONE: "El celular debe ser colombiano de 10 dígitos (3XXXXXXXXX).",
  CONSENT_REQUIRED: "Debes aceptar el tratamiento de datos y confirmar que eres mayor de edad.",
  RATE_LIMITED: "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
  FILE_TOO_LARGE: "El comprobante pesa demasiado (máx. 4 MB). Sube una foto o captura de pantalla.",
  INVALID_FILE: "Formato de comprobante no válido. Usa JPG, PNG, WEBP o PDF.",
  SERVER_NOT_CONFIGURED: "Falta configurar el servidor (SUPABASE_SERVICE_ROLE_KEY).",
  INVALID_REQUEST: "Datos incompletos o inválidos.",
  UNKNOWN_ERROR: "No pudimos completar la operación. Intenta de nuevo.",
};

export function friendlyError(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? String(err ?? "");
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  if (key) return ERRORS[key];
  if (msg.includes("duplicate key") && msg.includes("slug")) return "Ya existe una rifa con ese enlace (slug).";
  if (msg.includes("users_phone_format")) return "El WhatsApp debe ser un celular colombiano de 10 dígitos (3XXXXXXXXX).";
  return msg || "Ocurrió un error inesperado.";
}

/** Reduce fotos de celular (4-10 MB) a JPEG ≤ ~1 MB antes de subir */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
