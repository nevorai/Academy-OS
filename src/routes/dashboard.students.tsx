/**
 * Nevorai Academy: owner/coach Players screen.
 *
 * Layout only. The data, the chosen filters and the numbers live in
 * `useStudentsList`; the heading, filters, rows and the two pop-ups are in
 * `components/students`. Nothing here reads or writes the database directly.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DashboardSearch } from "@/components/dashboard-ui";
import { FilterTabs } from "@/components/shared/FilterTabs";
import { Button } from "@/components/ui/button";
import { AddStudentSheet } from "@/components/students/AddStudentSheet";
import { DeleteArchivedButton } from "@/components/students/DeleteArchivedButton";
import { ProfileSheet } from "@/components/students/ProfileSheet";
import { RegistrationsBanner } from "@/components/students/RegistrationsBanner";
import { MyBatchesToggle, StudentsFilterPanel } from "@/components/students/StudentsFilterPanel";
import { StudentsHeader } from "@/components/students/StudentsHeader";
import { StudentsListCard } from "@/components/students/StudentsListCard";
import { useStudentsList } from "@/hooks/use-students-list";
import { PRIMARY_STATUS_TABS, emptyListState } from "@/lib/students/filters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/students")({
  validateSearch: (search: Record<string, unknown>): { status?: string } => {
    const s = search.status;
    if (typeof s === "string") return { status: s };
    return {};
  },
  component: StudentsPage,
});

function StudentsPage() {
  const p = useStudentsList(Route.useSearch().status ?? "active");
  const { filters, counts } = p;

  const [showFilters, setShowFilters] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const openAdd = () => setAddOpen(true);

  return (
    <div className="space-y-5">
      <StudentsHeader
        total={counts.all}
        active={counts.active}
        exportCount={p.filtered.length}
        onExport={p.exportList}
        onAdd={openAdd}
      />

      <RegistrationsBanner tenantId={p.tenantId} />

      {/* Active / Left. The less common statuses are inside the Filters panel. */}
      <FilterTabs
        value={PRIMARY_STATUS_TABS.some((t) => t.key === filters.status) ? filters.status : ""}
        onChange={(k: string) => p.setFilter("status", k)}
        items={PRIMARY_STATUS_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: counts[t.key] ?? 0,
        }))}
        ariaLabel="Student status"
      />

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <DashboardSearch
            value={filters.q}
            onChange={(v) => p.setFilter("q", v)}
            placeholder="Search name, phone, Player ID, parent, city"
          />
        </div>
        {p.canDeleteArchived && filters.status === "left" && counts.left > 0 && (
          <DeleteArchivedButton tenantId={p.tenantId} count={counts.left} />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-label="Filters"
          className={cn(
            "shrink-0 h-11 rounded-full",
            p.activeFilterCount > 0 && "border-foreground/30",
          )}
        >
          <SlidersHorizontal className="size-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Filters</span>
          {p.activeFilterCount > 0 && (
            <span className="ml-1.5 grid place-items-center size-5 rounded-full bg-foreground text-background text-[10px] font-bold">
              {p.activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {p.isAnyCoach && (
        <MyBatchesToggle
          checked={p.myBatchesOnly}
          onChange={p.setMyBatchesOnly}
          batchCount={p.myBatchCount}
        />
      )}

      {showFilters && (
        <StudentsFilterPanel
          filters={filters}
          onChange={p.setFilter}
          onClear={p.clearPanelFilters}
          activeCount={p.activeFilterCount}
          batches={p.batches}
          joinYears={p.joinYears}
        />
      )}

      <StudentsListCard
        loading={p.isLoading}
        error={p.loadError}
        onRetry={() => void p.retry()}
        players={p.filtered}
        paidIds={p.paidIds}
        empty={emptyListState(filters.q, filters.status)}
        onAdd={openAdd}
        onOpen={(s) => {
          p.primeProfile(s);
          setProfileId(s.id);
        }}
        onStatusChanged={() => void p.refreshStudents()}
      />

      <AddStudentSheet open={addOpen} onOpenChange={setAddOpen} />
      <ProfileSheet id={profileId} onOpenChange={(open) => !open && setProfileId(null)} />
    </div>
  );
}
