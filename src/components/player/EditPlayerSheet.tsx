import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/shared/ResponsiveSheet";
import { useIsMobile } from "@/hooks/use-mobile";

// The editor is large; it loads only when somebody opens it.
const StudentProfilePanel = lazy(() =>
  import("@/components/dashboard/StudentProfilePanel").then((m) => ({
    default: m.StudentProfilePanel,
  })),
);

export function EditPlayerSheet({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Edit player" hideTitle>
      <Suspense
        fallback={
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin inline mr-2" />
            Loading editor…
          </div>
        }
      >
        <StudentProfilePanel studentId={studentId} compact={isMobile} />
      </Suspense>
    </ResponsiveSheet>
  );
}
