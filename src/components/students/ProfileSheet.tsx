import { StudentProfilePanel } from "@/components/dashboard/StudentProfilePanel";
import { ResponsiveSheet } from "@/components/shared/ResponsiveSheet";
import { useIsMobile } from "@/hooks/use-mobile";

/** A player's profile over the list. `id` null means closed. */
export function ProfileSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveSheet open={!!id} onOpenChange={onOpenChange} title="Player profile" hideTitle>
      {id && <StudentProfilePanel studentId={id} compact={isMobile} />}
    </ResponsiveSheet>
  );
}
