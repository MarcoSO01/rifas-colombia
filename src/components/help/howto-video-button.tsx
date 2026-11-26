"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import type { MediaKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaView } from "@/components/media/media-view";

/** Botón “Ver cómo comprar” que abre el video tutorial en una ventana */
export function HowToVideoButton({ url, kind, title }: { url: string; kind: MediaKind; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlayCircle className="text-brand-500" /> Ver cómo comprar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {open && <MediaView item={{ kind, url }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
