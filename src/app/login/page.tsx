import { redirect } from "next/navigation";
import { ShieldCheck, Zap, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GoogleButton } from "@/components/layout/google-button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/admin", error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next.startsWith("/") ? next : "/");

  return (
    <div className="container grid min-h-[75dvh] place-items-center py-10">
      <Card className="w-full max-w-md animate-float-up">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-300 to-brand-600 shadow-brand">
            <Ticket className="h-8 w-8 text-white" />
          </div>
          <h1 className="font-display text-3xl font-black">
            Acceso <span className="text-gradient">administrador</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Solo para el organizador. Para comprar números no necesitas cuenta.</p>
          {error && (
            <p className="mt-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">
              No pudimos iniciar sesión. Intenta de nuevo.
            </p>
          )}
          <div className="mt-6">
            <GoogleButton next={next} />
          </div>
          <ul className="mt-6 space-y-2 text-left text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-brand-300" /> Ingresa con el Gmail registrado como administrador.</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Si tu correo no es admin, volverás al inicio.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
