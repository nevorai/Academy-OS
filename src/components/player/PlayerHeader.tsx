import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  Pencil,
  Phone,
  Share2,
  StickyNote,
  Swords,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ds/Card";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { attendanceStateLabels } from "@/lib/attendance/constants";
import { ageInYears } from "@/lib/students/profile-stats";
import type { PlayerTab } from "@/lib/students/profile-tabs";
import type { PlayerStudent } from "@/hooks/use-player-profile";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

type Athlete = { primary_sport?: unknown; dominant_hand?: unknown; cricket?: unknown } | null;

/** Role and batting hand as shown under the name, with sensible fallbacks. */
function playerLabels(athlete: Athlete) {
  const cricket = (athlete?.cricket ?? null) as {
    role?: string | null;
    batting_style?: string | null;
  } | null;
  const role =
    cricket?.role?.replace(/_/g, " ") ?? (athlete?.primary_sport as string | undefined) ?? "Player";
  const hand =
    cricket?.batting_style?.replace("_hand", "-hand") ??
    (athlete?.dominant_hand as string | undefined) ??
    null;
  return { role, hand };
}

const PILL_TONE: Record<string, string> = {
  in_academy: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  checked_out: "bg-sky-500/12 text-sky-600 dark:text-sky-400 border-sky-500/25",
  absent: "bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25",
  not_marked: "bg-muted text-muted-foreground border-border",
};
const PILL_DOT: Record<string, string> = {
  in_academy: "bg-emerald-500 animate-pulse",
  checked_out: "bg-sky-500",
  absent: "bg-rose-500",
  not_marked: "bg-muted-foreground/60",
};

function StatusPill({ state }: { state: string }) {
  const label = attendanceStateLabels[state as keyof typeof attendanceStateLabels] ?? "Unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        PILL_TONE[state] ?? PILL_TONE.not_marked,
      )}
    >
      <span className={cn("size-1.5 rounded-full", PILL_DOT[state] ?? PILL_DOT.not_marked)} />
      {label}
    </span>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 h-16 rounded-xl border border-border bg-card transition-colors",
        !disabled && "hover:bg-accent active:scale-[0.98]",
        disabled && "opacity-40",
      )}
    >
      <span style={{ color: disabled ? undefined : "var(--brand)" }}>
        <Icon className="size-4" />
      </span>
      <span className="text-[10.5px] font-medium">{label}</span>
    </div>
  );
  if (disabled) return <div>{inner}</div>;
  if (href) {
    return (
      <a href={href} className="focus:outline-none">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className="focus:outline-none w-full">
      {inner}
    </button>
  );
}

/** Back link, share and edit buttons, the player card and the quick-action row. */
export function PlayerHeader({
  student,
  athlete,
  liveState,
  onEdit,
  onTab,
}: {
  student: PlayerStudent;
  athlete: Athlete;
  liveState: string;
  onEdit: () => void;
  onTab: (tab: PlayerTab) => void;
}) {
  const navigate = useNavigate();
  const age = ageInYears(student.dob);
  const { role, hand } = playerLabels(athlete);
  const callNumber = student.guardian_phone || student.phone || null;

  const share = async () => {
    const url = `${window.location.origin}/dashboard/students/${student.id}`;
    try {
      if (navigator.share) await navigator.share({ title: student.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* the person closed the share sheet */
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else navigate({ to: "/dashboard/students" });
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Players
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="grid place-items-center size-9 rounded-full hover:bg-accent transition-colors"
          >
            <Share2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit player"
            className="grid place-items-center size-9 rounded-full hover:bg-accent transition-colors"
          >
            <Pencil className="size-4" />
          </button>
        </div>
      </div>

      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-4">
          <PersonAvatar
            name={student.name}
            src={student.photo_url ?? undefined}
            className="size-20 md:size-24 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">
                {student.name}
              </h1>
              <StatusPill state={liveState} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {student.player_id ? <span>#{student.player_id}</span> : null}
              {age != null ? <span>{age} yrs</span> : null}
              <span className="capitalize">{role}</span>
              {hand ? <span className="capitalize">{hand}</span> : null}
              {student.batches?.name ? <span>{student.batches.name}</span> : null}
            </div>
            {student.joined_at ? (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="size-3" /> Joined{" "}
                {format(new Date(student.joined_at), "MMM d, yyyy")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
          <QuickAction icon={Pencil} label="Edit" onClick={onEdit} />
          <QuickAction
            icon={ClipboardCheck}
            label="Attendance"
            onClick={() => onTab("attendance")}
          />
          <QuickAction icon={Swords} label="Matches" onClick={() => onTab("matches")} />
          <QuickAction icon={StickyNote} label="Notes" onClick={() => onTab("overview")} />
          <QuickAction
            icon={Phone}
            label="Call"
            disabled={!callNumber}
            href={callNumber ? `tel:${callNumber}` : undefined}
          />
          <QuickAction icon={Share2} label="Share" onClick={share} />
        </div>
      </Card>
    </>
  );
}
