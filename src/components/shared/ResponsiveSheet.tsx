import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * One pop-up, two shapes: a sheet that slides up from the bottom on phones and
 * a centred dialog on wider screens. Both scroll inside themselves, so a long
 * form never pushes the page sideways or past the screen.
 *
 * `hideTitle` keeps the title for screen readers only, for content that brings
 * its own heading.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0 border-0 max-h-[92vh] overflow-y-auto"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
          <div className="p-5 pt-3">
            <SheetHeader>
              <SheetTitle className={cn("text-left", hideTitle && "sr-only")}>{title}</SheetTitle>
            </SheetHeader>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={cn(hideTitle && "sr-only")}>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
