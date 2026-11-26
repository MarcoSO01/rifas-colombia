import type { SiteSettings } from "@/lib/types";
import { cn, whatsappLink } from "@/lib/utils";
import { FacebookIcon, InstagramIcon, TikTokIcon, WhatsAppIcon } from "./icons";

export function SocialLinks({ settings, className, size = "md" }: { settings: SiteSettings; className?: string; size?: "sm" | "md" }) {
  const links = [
    settings.facebook_url && { href: settings.facebook_url, label: "Facebook", Icon: FacebookIcon },
    settings.instagram_url && { href: settings.instagram_url, label: "Instagram", Icon: InstagramIcon },
    settings.tiktok_url && { href: settings.tiktok_url, label: "TikTok", Icon: TikTokIcon },
    settings.owner_whatsapp && { href: whatsappLink(settings.owner_whatsapp, "Hola, quiero información sobre los sorteos"), label: "WhatsApp", Icon: WhatsAppIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof FacebookIcon }[];
  if (!links.length) return null;
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={cn("grid place-items-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:border-brand-500 hover:bg-brand-600 hover:text-white", box)}
        >
          <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </a>
      ))}
    </div>
  );
}

/** Botón flotante de ayuda por WhatsApp (abajo a la derecha) */
export function WhatsAppFloat({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a
      href={whatsappLink(phone, "Hola 👋 necesito ayuda para comprar mis números")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ayuda por WhatsApp"
      className="fixed bottom-5 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-xl shadow-black/40 transition hover:scale-105"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
