import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;

export function SectionHeader({ icon: Icon, title }: { icon: IconType; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      <Icon className="size-3.5" />
      {title}
    </div>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground">{text}</div>;
}

export function Skel() {
  return <div className="h-10 rounded-md bg-muted/60 animate-pulse" />;
}

export function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums leading-tight">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div> : null}
    </div>
  );
}

export function ChipPill({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "gold" | "muted";
}) {
  const cls: Record<string, string> = {
    brand: "bg-[color:color-mix(in_oklab,var(--brand)_12%,transparent)] text-[color:var(--brand)]",
    gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        cls[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A small rounded square holding an icon, tinted with the academy's brand colour. */
export function BrandIconBox({ icon: Icon, className }: { icon: IconType; className?: string }) {
  return (
    <div
      className={cn("grid place-items-center rounded-lg shrink-0", className)}
      style={{
        backgroundColor: "color-mix(in oklab, var(--brand) 12%, transparent)",
        color: "var(--brand)",
      }}
    >
      <Icon className="size-4" />
    </div>
  );
}
