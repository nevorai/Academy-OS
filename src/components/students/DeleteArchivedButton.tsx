import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { qk } from "@/lib/dashboard-queries";
import { deleteAllArchivedStudents } from "@/lib/students-manage.functions";

/**
 * "Delete All" on the Left tab: erases every archived player for good. It asks
 * twice, because nothing brings them back. The server checks who is asking;
 * this button is only the way in.
 */
export function DeleteArchivedButton({ tenantId, count }: { tenantId: string; count: number }) {
  const qc = useQueryClient();
  const deleteArchived = useServerFn(deleteAllArchivedStudents);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const run = async () => {
    try {
      const res = await deleteArchived({ data: { tenantId } });
      toast.success(`Successfully deleted ${res.count} students`);
      qc.invalidateQueries({ queryKey: qk.students(tenantId) });
      qc.invalidateQueries({ queryKey: qk.kpis(tenantId) });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message || "Failed to delete students");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-11 shrink-0 rounded-full px-4 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200"
        onClick={() => {
          setStep(1);
          setOpen(true);
        }}
      >
        <X className="size-4 mr-2" />
        Delete All
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-3xl max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {step === 1 ? "Permanent Deletion" : "Final Confirmation"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {step === 1 ? (
                <>
                  Are you absolutely sure? Permanently delete ALL <strong>{count}</strong> archived
                  students?
                  <br />
                  <br />
                  This will erase ALL their historical data and cannot be undone.
                </>
              ) : (
                <>
                  FINAL CONFIRMATION: Are you really sure you want to completely erase{" "}
                  <strong>{count}</strong> profiles?
                  <br />
                  <br />
                  This action is irreversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="rounded-xl flex-1" onClick={() => setStep(1)}>
              Cancel
            </AlertDialogCancel>
            {step === 1 ? (
              <Button
                variant="destructive"
                className="rounded-xl flex-1"
                onClick={() => setStep(2)}
              >
                Yes, continue
              </Button>
            ) : (
              <AlertDialogAction
                className="rounded-xl flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                onClick={run}
              >
                Confirm Delete All
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
