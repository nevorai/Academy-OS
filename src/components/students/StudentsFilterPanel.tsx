import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGE_GROUPS, PLAYER_STATUSES, type PlayerStatus } from "@/lib/students/constants";
import {
  ADVANCED_STATUSES,
  GENDER_FILTER_OPTIONS,
  ROLE_FILTER_OPTIONS,
  type StudentFilters,
} from "@/lib/students/filters";

type Option = { value: string; label: string };

/**
 * The fold-out filters under the search box: batch, gender, playing role, age
 * group, joining year and the less common statuses. Two columns on a phone,
 * three from a tablet up.
 */
export function StudentsFilterPanel({
  filters,
  onChange,
  onClear,
  activeCount,
  batches,
  joinYears,
}: {
  filters: StudentFilters;
  onChange: <K extends keyof StudentFilters>(key: K, value: StudentFilters[K]) => void;
  onClear: () => void;
  /** How many of the panel's filters are switched on. */
  activeCount: number;
  batches: readonly { id: string; name: string }[];
  joinYears: readonly string[];
}) {
  const advancedStatus = ADVANCED_STATUSES.includes(filters.status as PlayerStatus)
    ? filters.status
    : "all";

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
      <FilterSelect
        label="Batch"
        value={filters.batch}
        onChange={(v) => onChange("batch", v)}
        options={[
          { value: "all", label: "All batches" },
          ...batches.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />
      <FilterSelect
        label="Gender"
        value={filters.gender}
        onChange={(v) => onChange("gender", v)}
        options={GENDER_FILTER_OPTIONS}
      />
      <FilterSelect
        label="Playing role"
        value={filters.role}
        onChange={(v) => onChange("role", v)}
        options={ROLE_FILTER_OPTIONS}
      />
      <FilterSelect
        label="Age group"
        value={filters.ageGroup}
        onChange={(v) => onChange("ageGroup", v)}
        options={[
          { value: "all", label: "All ages" },
          ...AGE_GROUPS.map((g) => ({ value: g.key, label: g.label })),
        ]}
      />
      <FilterSelect
        label="Joining year"
        value={filters.joinYear}
        onChange={(v) => onChange("joinYear", v)}
        options={[
          { value: "all", label: "All years" },
          ...joinYears.map((y) => ({ value: y, label: y })),
        ]}
      />
      <FilterSelect
        label="Advanced status"
        value={advancedStatus}
        onChange={(v) => onChange("status", v === "all" ? "active" : v)}
        options={[
          { value: "all", label: "None" },
          ...ADVANCED_STATUSES.map((k) => ({
            value: k,
            label: PLAYER_STATUSES.find((p) => p.value === k)?.label ?? k,
          })),
        ]}
      />
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-muted-foreground hover:text-foreground self-end pb-2"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly Option[];
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A coach's switch between their own batches and the whole academy. */
export function MyBatchesToggle({
  checked,
  onChange,
  batchCount,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  batchCount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-full bg-card border border-border px-3 py-1.5 shadow-sm">
      <span className="min-w-0 text-xs text-muted-foreground">
        {checked
          ? `Showing only your ${batchCount} assigned ${batchCount === 1 ? "batch" : "batches"}`
          : "Showing all students in the academy"}
      </span>
      <label className="inline-flex shrink-0 items-center gap-2 text-xs font-medium cursor-pointer">
        My batches only
        <input
          type="checkbox"
          className="size-4 accent-foreground"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    </div>
  );
}
