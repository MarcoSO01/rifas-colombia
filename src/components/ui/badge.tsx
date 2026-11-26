import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-brand-500/40 bg-brand-500/15 text-brand-200",
        success: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
        info: "border-sky-400/40 bg-sky-400/15 text-sky-200",
        violet: "border-violet-400/40 bg-violet-400/15 text-violet-200",
        danger: "border-rose-400/40 bg-rose-400/15 text-rose-200",
        muted: "border-white/10 bg-white/5 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
