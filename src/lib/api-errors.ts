/** Códigos de error que se pueden mostrar al usuario (el resto se oculta) */
const PUBLIC_CODES = [
  "INVALID_BUYER_NAME", "INVALID_BUYER_ID", "INVALID_BUYER_PHONE", "RAFFLE_NOT_AVAILABLE", "RAFFLE_CLOSED",
  "NO_NUMBERS", "TOO_MANY_NUMBERS", "RECEIPT_REQUIRED", "INVALID_RECEIPT", "TOO_MANY_PENDING", "NUMBERS_TAKEN",
  "INVALID_PARTIAL_AMOUNT", "PARTIAL_TOO_LOW", "RATE_LIMITED", "CONSENT_REQUIRED", "FILE_TOO_LARGE",
  "INVALID_FILE", "SERVER_NOT_CONFIGURED", "FORBIDDEN", "INVALID_REQUEST",
];

export function publicErrorCode(message: string | undefined | null) {
  return PUBLIC_CODES.find((c) => message?.includes(c)) ?? "UNKNOWN_ERROR";
}

export function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
