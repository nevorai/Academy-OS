import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Players get a temporary password from the academy. The first time they sign in,
 * they must choose their own. The dialog cannot be dismissed until they do.
 * Mounted once per signed-in area (player, parent, dashboard).
 */
export function ForcePasswordChange() {
  const [needed, setNeeded] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const flag = (data.user?.user_metadata as { must_change_password?: boolean } | undefined)
        ?.must_change_password;
      setNeeded(Boolean(flag));
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (pw.length < 8) return toast.error("Use at least 8 characters.");
    if (pw !== pw2) return toast.error("The two passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: pw,
      data: { must_change_password: false },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password saved");
    setNeeded(false);
  };

  return (
    <Dialog open={needed} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-sm [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choose your own password</DialogTitle>
          <DialogDescription>
            You signed in with a temporary password. Pick a new one that only you know.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password (8+ characters)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save password"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
