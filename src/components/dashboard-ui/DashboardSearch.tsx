import { forwardRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * DashboardSearch — the canonical search input.
 *
 * Same 9 px radius, height, icon and placement everywhere. Do not use a raw
 * <Input> for search fields inside dashboard routes.
 */
export const DashboardSearch = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
    autoFocus?: boolean;
  }
>(function DashboardSearch(
  { value, onChange, placeholder = "Search…", className, ariaLabel, autoFocus },
  ref,
) {
  return (
    <div className={cn("relative flex-1 min-w-0", className)}>
      <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        ref={ref}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-10 rounded-[9px] border-border bg-card pl-10 shadow-none"
      />
    </div>
  );
});
