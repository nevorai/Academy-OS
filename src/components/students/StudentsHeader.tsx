import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, Plus } from "lucide-react";
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
 * right. On a phone the actions shrink to their icons (each one carries its
 * name for screen readers). Whenever the title and the buttons do not fit on
 * one row (a phone, or a laptop with the menu open) the buttons drop to a row
 * of their own, so the title is never squeezed under them.
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
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="max-w-full shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Players</h1>
        <p className="text-[12.5px] sm:text-sm text-muted-foreground mt-0.5 truncate">
          {total} total · {active} active
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
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
        <Button
          onClick={onAdd}
          aria-label="Add player"
          className="rounded-full h-9 sm:h-10 px-3 sm:px-5 font-semibold"
          style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <Plus className="size-4 sm:mr-1" /> <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
    </header>
  );
}
