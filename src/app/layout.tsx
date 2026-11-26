import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Exo_2, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Navbar } from "@/components/layout/navbar";
import { getSiteSettings } from "@/lib/settings";
import { SocialLinks, WhatsAppFloat } from "@/components/social/social-links";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Exo_2({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800", "900"] });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: `${s.brand_name} · Rifas y sorteos`, template: `%s · ${s.brand_name}` },
    description: s.tagline ?? "Elige tus números de la suerte, paga con Nequi, Daviplata, Bre-B o efectivo y participa.",
  };
}

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    // suppressHydrationWarning: extensiones del navegador (traductor, gestores de contraseñas) agregan atributos
    <html lang="es-CO" className={`dark ${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans" suppressHydrationWarning>
        <Navbar />
        <main className="pb-28">{children}</main>
        <footer className="container space-y-3 border-t border-white/5 py-8 text-center text-xs text-muted-foreground">
          <SocialLinks settings={settings} className="justify-center" />
          <p>{settings.brand_name} · Juego responsable. Solo mayores de 18 años. Datos tratados conforme a la Ley 1581 de 2012.</p>
          <p><Link href="/login?next=/admin" className="opacity-60 hover:opacity-100">Acceso administrador</Link></p>
        </footer>
        <WhatsAppFloat phone={settings.owner_whatsapp} />
        <Toaster theme="dark" position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
