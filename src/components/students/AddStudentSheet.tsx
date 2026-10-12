import { ResponsiveSheet } from "@/components/shared/ResponsiveSheet";
import { AddStudentForm } from "@/components/students/AddStudentForm";

/** "Add player" over the list. The form starts blank every time it opens. */
export function AddStudentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Add player">
      <AddStudentForm onDone={() => onOpenChange(false)} />
    </ResponsiveSheet>
  );
}
