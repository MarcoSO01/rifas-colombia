import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/admin");
  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-black sm:text-3xl">Panel <span className="text-gradient">Admin</span></h1>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
