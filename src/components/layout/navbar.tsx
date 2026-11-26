import Link from "next/link";
import { LogOut, Search, Shield, Sparkles } from "lucide-react";
import { getSessionProfile } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";

export async function Navbar() {
  const [{ user, profile }, settings] = await Promise.all([getSessionProfile(), getSiteSettings()]);
  const isAdmin = profile?.role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          {settings.logo_url ? (
            // El logo ya incluye el nombre de la marca
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt={settings.brand_name} className="h-9 w-auto max-w-[180px] object-contain sm:h-11 sm:max-w-[220px]" />
          ) : (
            <>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand">
                <Sparkles className="h-5 w-5 text-white" />
              </span>
              <span className="truncate font-display text-xl font-black tracking-tight">{settings.brand_name}</span>
            </>
          )}
        </Link>

        <nav className="flex items-center gap-1">
          <Button asChild size="sm" variant={isAdmin ? "ghost" : "default"}>
            <Link href="/consultar"><Search /> <span className="hidden sm:inline">Consultar mis números</span><span className="sm:hidden">Mis números</span></Link>
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin"><Shield /> <span className="hidden sm:inline">Admin</span></Link>
            </Button>
          )}
          {user && (
            <form action="/auth/signout" method="post">
              <Button variant="ghost" size="icon" aria-label="Cerrar sesión"><LogOut /></Button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
