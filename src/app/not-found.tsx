import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container grid min-h-[60dvh] place-items-center text-center">
      <div>
        <p className="font-display text-7xl font-black text-gradient">404</p>
        <p className="mt-2 text-muted-foreground">Esta rifa no existe o aún no ha sido publicada.</p>
        <Button asChild className="mt-6"><Link href="/">Volver al inicio</Link></Button>
      </div>
    </div>
  );
}
