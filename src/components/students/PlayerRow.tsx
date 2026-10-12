import { useState } from "react";
import { Archive, ArchiveRestore, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { setStudentStatus } from "@/lib/students-manage";
import { PLAYER_STATUSES, type PlayerStatus } from "@/lib/students/constants";
import { cn } from "@/lib/utils";

/** The fields of a player a list row shows. */
export interface PlayerRowData {
  id: string;
  name: string;
  status?: string | null;
  photo_url?: string | null;
  player_id?: string | null;
  playing_role?: string | null;
  phone?: string | null;
}

/**
 * One player in the list: tap the row to open the profile, tap the arrow for
 * the status menu (archive, reactivate, trial and the rest). Active players
 * show whether this cycle's fee is paid; everyone else shows their status.
 */
export function PlayerRow({
  index,
  s,
  paid,
  onOpen,
  onStatusChanged,
}: {
  index: number;
  s: PlayerRowData;
  paid: boolean;
  onOpen: () => void;
  onStatusChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = PLAYER_STATUSES.find((m) => m.value === s.status);
  const isActive = s.status === "active";
  const isArchived = s.status === "left";

  const changeStatus = async (next: PlayerStatus) => {
    setBusy(true);
    try {
      await setStudentStatus(s.id, next);
      toast.success(next === "active" ? "Player reactivated" : `Status → ${next}`);
      onStatusChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 md:gap-3 pr-2">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 flex items-center gap-3 md:gap-4 p-4 md:px-5 hover:bg-accent/60 transition-colors text-left"
      >
        <div className="hidden md:flex w-6 text-xs text-muted-foreground tabular-nums justify-center">
          {index + 1}
        </div>
        <PersonAvatar name={s.name} src={s.photo_url} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[15px] truncate text-foreground">{s.name}</span>
            {s.player_id && (
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                {s.player_id}
              </span>
            )}
          </div>
          {(s.playing_role || s.phone) && (
            <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
              {[s.playing_role, s.phone].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {isActive ? (
          <FeePill paid={paid} />
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
            {meta?.label ?? s.status}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="grid place-items-center size-9 rounded-full text-muted-foreground hover:bg-accent shrink-0"
            aria-label="Player actions"
            disabled={busy}
          >
            <ChevronRight className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>Open profile</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
            Change status
          </DropdownMenuLabel>
          {PLAYER_STATUSES.filter((m) => m.value !== s.status).map((m) => (
            <DropdownMenuItem key={m.value} onClick={() => changeStatus(m.value)}>
              {m.value === "left" ? (
                <Archive className="size-3.5 mr-2" />
              ) : m.value === "active" && isArchived ? (
                <ArchiveRestore className="size-3.5 mr-2" />
              ) : null}
              {m.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FeePill({ paid }: { paid: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        paid ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full mr-1.5", paid ? "bg-emerald-500" : "bg-rose-500")}
      />
      {paid ? "Paid" : "Due"}
    </span>
  );
}
