import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, ExternalLink, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkImportStudents } from "@/components/dashboard/BulkImportStudents";
import { CreateLoginsDialog } from "@/components/dashboard/CreateLoginsDialog";
import { ShareRegistrationLink } from "@/components/dashboard/ShareRegistrationLink";
import { warmXlsx } from "@/lib/xlsx-lazy";

/**
 * Players page heading: the totals on the left, the page's actions on the
 * right. On a phone the title, a "More" button and "Add" share ONE row; the
 * less-used actions (export, share link, import, logins, fees page) open
 * under it with their names written out, never as bare icons.
 */
export function StudentsHeader({
  total,
  active,
  exportCount,
  onExport,
  onAdd,
}: {
  total: number;
  active: number;
  /** How many players the current filters would export. */
  exportCount: number;
  onExport: (format: "csv" | "xlsx") => void;
  onAdd: () => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:items-end">
      <div className="flex min-w-0 max-w-full items-baseline gap-2 sm:block sm:shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Players</h1>
        <p className="text-[12.5px] sm:text-sm text-muted-foreground sm:mt-0.5 truncate">
          {total} total · {active} active
        </p>
      </div>
      <div
        className={cn(
          "order-last basis-full flex-wrap items-center gap-1.5 sm:order-none sm:ml-auto sm:flex sm:basis-auto sm:justify-end sm:gap-2",
          more ? "flex" : "hidden",
          // Phones: the opened row shows each button's name beside its icon.
          "max-sm:[&_button>span]:!inline max-sm:[&_a>span]:!inline max-sm:[&_svg]:mr-1.5",
        )}
      >
        <DropdownMenu onOpenChange={(open) => open && warmXlsx()}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-full h-9" aria-label="Export">
              <Download className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">
              {exportCount} rows · current filters
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("csv")}>CSV (.csv)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ShareRegistrationLink />
        <BulkImportStudents />
        <CreateLoginsDialog />
        <Button asChild variant="outline" size="sm" className="rounded-full h-9">
          <Link to="/fees" target="_blank" className="flex items-center" aria-label="View fees">
            <ExternalLink className="size-4 sm:mr-1.5" />
            <span className="hidden sm:inline">View Fees</span>
          </Link>
        </Button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-full sm:hidden"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          More{" "}
          <ChevronDown className={cn("ml-1 size-4 transition-transform", more && "rotate-180")} />
        </Button>
        <Button
          onClick={onAdd}
          aria-label="Add player"
          className="rounded-full h-10 px-4 sm:px-5 font-semibold"
          style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </div>
    </header>
  );
}
