import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-white/10", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300 transition-[width] duration-700 ease-out"
        style={{ width: `${v}%` }}
      />
      <div className="shine pointer-events-none absolute inset-0 opacity-40" />
    </div>
  );
}
