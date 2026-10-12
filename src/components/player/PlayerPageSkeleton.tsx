import { Skeleton } from "@/components/ui/skeleton";

/** Same shape as the loaded page (back row, player card, eight numbers, tab strip), so nothing jumps. */
export function PlayerPageSkeleton() {
  return (
    <div className="space-y-4 pb-8 max-w-3xl mx-auto" aria-busy="true" aria-label="Loading player">
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="flex gap-4 border-b border-border pb-2.5">
        {["Overview", "Timeline", "Performance", "Attendance"].map((t) => (
          <Skeleton key={t} className="h-4 w-16" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
