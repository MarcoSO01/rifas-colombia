export type RaffleStatus = "draft" | "published" | "paused" | "finished";
export type TicketStatus = "available" | "pending" | "partial" | "paid";
export type TxStatus = "pending" | "partial" | "approved" | "rejected" | "expired";
export type PayMethod = "nequi" | "daviplata" | "breb" | "bancolombia" | "cash";
export type PayPlan = "full" | "partial";
export type UserRole = "user" | "admin";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  birth_date: string | null;
  national_id: string | null;
  data_consent_at: string | null;
  role: UserRole;
}

export interface Raffle {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  prize: string;
  image_url: string | null;
  ticket_price: number;
  total_numbers: number;
  draw_date: string | null;
  lottery_reference: string | null;
  hold_minutes: number;
  verification_minutes: number;
  min_partial_percent: number;
  max_numbers_per_order: number;
  status: RaffleStatus;
  winner_number: number | null;
  created_at: string;
}

export interface RaffleSummary extends Raffle {
  available_count: number;
  pending_count: number;
  partial_count: number;
  paid_count: number;
}

export interface Ticket {
  id: number;
  raffle_id: string;
  number: number;
  status: TicketStatus;
  transaction_id: string | null;
  held_until: string | null;
}

export interface Transaction {
  id: string;
  code: string;
  raffle_id: string;
  user_id: string | null;
  numbers: number[];
  method: PayMethod;
  plan: PayPlan;
  amount_total: number;
  amount_declared: number;
  amount_paid: number;
  receipt_path: string | null;
  status: TxStatus;
  expires_at: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_national_id: string | null;
  is_manual: boolean;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface TransactionWithRaffle extends Transaction {
  raffles: Pick<Raffle, "title" | "slug" | "total_numbers" | "draw_date" | "status" | "winner_number"> | null;
}

export type MediaKind = "image" | "video" | "youtube" | "embed" | "pdf";
export type MediaPlacement = "home_banner" | "gallery" | "rules" | "side_left" | "side_right";

export interface MediaItem {
  id: string;
  raffle_id: string | null;
  placement: MediaPlacement;
  kind: MediaKind;
  url: string;
  link_url: string | null;
  caption: string | null;
  sort_order: number;
  is_active: boolean;
}

export const PLACEMENT_LABEL: Record<MediaPlacement, string> = {
  home_banner: "Banner del inicio",
  gallery: "Galería del premio",
  rules: "¿Cómo se juega? (metodología)",
  side_left: "Banner lateral izquierdo",
  side_right: "Banner lateral derecho",
};

export interface SiteSettings {
  brand_name: string;
  tagline: string | null;
  logo_url: string | null;
  howto_title: string;
  howto_video_url: string | null;
  owner_whatsapp: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  share_hashtags: string | null;
}

/** Orden tal como la devuelve /api/lookup (consulta pública) */
export interface PublicOrder {
  id: string;
  code: string;
  numbers: number[];
  method: PayMethod;
  plan: PayPlan;
  amount_total: number;
  amount_declared: number;
  amount_paid: number;
  status: TxStatus;
  expires_at: string | null;
  admin_note: string | null;
  created_at: string;
  buyer_name: string | null;
  raffles: Pick<Raffle, "title" | "slug" | "total_numbers" | "draw_date" | "status" | "winner_number"> | null;
}

export interface PaymentMethod {
  id: string;
  method: PayMethod;
  label: string;
  account_holder: string | null;
  account_number: string | null;
  account_type: string | null;
  instructions: string | null;
  qr_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  breb: "Llave Bre-B",
  bancolombia: "Bancolombia",
  cash: "Efectivo / Presencial",
};

export const METHOD_COLOR: Record<PayMethod, string> = {
  nequi: "from-fuchsia-500 to-purple-700",
  daviplata: "from-red-500 to-rose-700",
  breb: "from-sky-400 to-indigo-600",
  bancolombia: "from-yellow-300 to-amber-500",
  cash: "from-emerald-400 to-green-700",
};

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  pending: "En verificación",
  partial: "Abonado",
  approved: "Pagado",
  rejected: "Rechazado",
  expired: "Vencido",
};

export const RAFFLE_STATUS_LABEL: Record<RaffleStatus, string> = {
  draft: "Borrador",
  published: "Activa",
  paused: "Pausada",
  finished: "Finalizada",
};
