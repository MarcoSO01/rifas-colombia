import { getSessionProfile } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata = { title: "Mi perfil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; onboarding?: string }>;
}) {
  const { next, onboarding } = await searchParams;
  const { profile } = await getSessionProfile();
  return (
    <div className="container max-w-xl py-8">
      <h1 className="font-display text-3xl font-black">
        {onboarding ? <>¡Bienvenido! <span className="text-gold">Completa tu perfil</span></> : <>Mi <span className="text-gold">perfil</span></>}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Usamos estos datos para confirmar tus pagos y contactarte si ganas.
      </p>
      <div className="mt-6">
        <ProfileForm profile={profile!} next={next?.startsWith("/") ? next : undefined} />
      </div>
    </div>
  );
}
