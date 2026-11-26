import { getSiteSettings } from "@/lib/settings";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";
import { MediaManager } from "@/components/admin/media-manager";

export const metadata = { title: "Admin · Contenido" };

export default async function ContentAdminPage() {
  const settings = await getSiteSettings();
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SiteSettingsForm initial={settings} />
      <MediaManager
        raffleId={null}
        placements={["home_banner"]}
        title="Banners del inicio"
        description="Se muestran en carrusel arriba de la página principal. Pueden ser fotos, videos cortos o YouTube."
      />
    </div>
  );
}
