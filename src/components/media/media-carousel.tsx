"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gift } from "lucide-react";
import type { MediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MediaView } from "./media-view";

export interface Slide {
  id: string;
  kind: MediaKind;
  url: string;
  caption?: string | null;
  link_url?: string | null;
}

interface Props {
  slides: Slide[];
  /** Clase de proporción, ej. "aspect-[4/3]" o "aspect-[21/9]" */
  aspect?: string;
  /** Avance automático en ms (solo cuando la diapositiva actual es imagen) */
  autoplayMs?: number;
  className?: string;
  overlay?: React.ReactNode;
}

export function MediaCarousel({ slides, aspect = "aspect-[4/3]", autoplayMs, className, overlay }: Props) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  const current = slides[index];

  const go = useCallback((dir: number) => setIndex((i) => (i + dir + count) % count), [count]);

  useEffect(() => {
    if (!autoplayMs || count < 2 || current?.kind !== "image") return;
    const t = setTimeout(() => go(1), autoplayMs);
    return () => clearTimeout(t);
  }, [autoplayMs, count, current?.kind, go, index]);

  if (!count) {
    return (
      <div className={cn("relative grid place-items-center bg-gradient-to-br from-zinc-900 to-black", aspect, className)}>
        <Gift className="h-20 w-20 text-brand-400/60" />
        {overlay}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-black", aspect, className)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={cn("absolute inset-0 transition-opacity duration-500", i === index ? "z-10 opacity-100" : "pointer-events-none opacity-0")}
          aria-hidden={i !== index}
        >
          <SlideView slide={s} active={i === index} />
        </div>
      ))}

      {overlay && <div className="pointer-events-none absolute inset-0 z-20">{overlay}</div>}

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Anterior" className="absolute left-2 top-1/2 z-30 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 backdrop-blur transition hover:bg-black/70">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Siguiente" className="absolute right-2 top-1/2 z-30 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 backdrop-blur transition hover:bg-black/70">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir a ${i + 1}`}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-brand-300" : "w-2 bg-white/50")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SlideView({ slide, active }: { slide: Slide; active: boolean }) {
  // Videos y reproductores externos solo existen en la diapositiva visible (así se detienen al cambiar)
  if (!active && slide.kind !== "image") return null;
  return (
    <div className="relative h-full w-full">
      <MediaView item={slide} layout="fill" />
      {slide.caption && slide.kind === "image" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pb-7 text-sm font-semibold">{slide.caption}</p>
      )}
    </div>
  );
}
