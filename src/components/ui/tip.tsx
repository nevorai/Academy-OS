import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The name of an icon, shown the moment the pointer or keyboard focus lands on it. Use on every icon-only
 * control instead of a `title` attribute (the browser one is slow). Needs a TooltipProvider above it.
 * The child must be a single element that takes a ref and props; keep its aria-label.
 */
export function Tip({
  label,
  side = "right",
  disabled = false,
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  children: React.ReactElement;
}) {
  if (disabled) return children;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={10} className="z-[60] rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
