import { Plus } from "lucide-react";
import { ErrorState } from "@/components/ds";
import { VirtualList } from "@/components/ds/VirtualList";
import { Button } from "@/components/ui/button";
import { PlayerRow, type PlayerRowData } from "@/components/students/PlayerRow";

/**
 * The white card that holds the players: grey placeholder rows while the list
 * loads, a plain message when it is empty or could not be loaded, and the
 * rows themselves otherwise. Long lists only draw the rows on screen.
 */
export function StudentsListCard<T extends PlayerRowData>({
  loading,
  error,
  onRetry,
  players,
  paidIds,
  empty,
  onAdd,
  onOpen,
  onStatusChanged,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  players: T[];
  /** Players who have paid for the current cycle. */
  paidIds: ReadonlySet<string>;
  empty: { message: string; offerAdd: boolean };
  onAdd: () => void;
  onOpen: (player: T) => void;
  onStatusChanged: () => void;
}) {
  return (
    <section className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState
          title="Players could not be loaded"
          description="Check the connection and try again."
          onRetry={onRetry}
        />
      ) : players.length === 0 ? (
        <div className="p-10 text-center">
          <div className="text-sm font-semibold text-foreground">{empty.message}</div>
          {empty.offerAdd ? (
            <div className="mt-3">
              <Button
                onClick={onAdd}
                className="rounded-full h-9 px-4 font-semibold text-sm"
                style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
              >
                <Plus className="size-4 mr-1" />
                Add Player
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <VirtualList
          items={players}
          estimateSize={84}
          overscan={10}
          className="max-h-[calc(100vh-320px)] min-h-[400px]"
          getKey={(s) => s.id}
          renderItem={(s, i) => (
            <div className="border-b border-border last:border-b-0">
              <PlayerRow
                index={i}
                s={s}
                paid={paidIds.has(s.id)}
                onOpen={() => onOpen(s)}
                onStatusChanged={onStatusChanged}
              />
            </div>
          )}
        />
      )}
    </section>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-label="Loading players">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="p-4 flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 rounded bg-muted animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}
