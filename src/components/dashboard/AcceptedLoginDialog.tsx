import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, MessageCircle } from "lucide-react";
import { toE164 } from "@/lib/phone";
import { createStudentLogins } from "@/lib/admissions/logins.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type State =
  | { status: "working" }
  | {
      status: "ok";
      username: string;
      password: string;
      url: string;
      academy: string;
      phone: string | null;
      whatsappSent: number;
    }
  | { status: "failed"; error: string };

const WAIT_MS = 25_000;

/**
 * Runs right after an enquiry is accepted. A player who applied through the public form
 * already has their own login, so nothing is shown. Otherwise it makes the login, sends it on
 * WhatsApp when the academy has that connected, and shows the ID and password once
 * so the owner can pass them on. Safe to repeat: a player who already has a login
 * is skipped by the server.
 */
export function AcceptedLoginDialog({
  tenantId,
  student,
  onClose,
}: {
  tenantId: string;
  student: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const create = useServerFn(createStudentLogins);
  const [state, setState] = useState<State>({ status: "working" });
  const startedFor = useRef<string | null>(null);

  const run = async (studentId: string) => {
    setState({ status: "working" });
    try {
      const out = await Promise.race([
        create({
          data: { tenantId, studentIds: [studentId], sendEmail: true, sendWhatsApp: true },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("This is taking too long")), WAIT_MS),
        ),
      ]);
      const r = out.results[0];
      if (r?.status === "created") {
        setState({
          status: "ok",
          username: r.username,
          password: r.password,
          url: out.loginUrl,
          academy: out.academy,
          phone: r.phone ?? r.guardianPhone ?? null,
          whatsappSent: r.whatsappSent,
        });
      } else if (!r) {
        // Applied through the public form: they already chose their own password. Nothing to show.
        onClose();
      } else {
        setState({ status: "failed", error: r.error ?? "Login was not created" });
      }
    } catch (e) {
      setState({
        status: "failed",
        error: e instanceof Error ? e.message : "Login was not created",
      });
    }
  };

  useEffect(() => {
    if (!student || startedFor.current === student.id) return;
    startedFor.current = student.id;
    void run(student.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  const ok = state.status === "ok" ? state : null;
  const text = ok
    ? `Welcome to ${ok.academy}!\nLogin ID: ${ok.username}\nPassword: ${ok.password}\nSign in: ${ok.url}\nPlease fill your details after you sign in. You can change the password there.`
    : "";
  const num = ok ? toE164(ok.phone ?? "") : null;
  const wa = num ? `https://wa.me/${num.replace("+", "")}?text=${encodeURIComponent(text)}` : null;

  return (
    <Dialog
      // Stays hidden while it works, so a player who already has a login never sees a window.
      open={!!student && state.status !== "working"}
      onOpenChange={(v) => {
        // The password is shown only once: do not close while it is being made.
        if (!v && state.status !== "working") onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            {student?.name ?? "Player"} is added
          </DialogTitle>
        </DialogHeader>

        {state.status === "working" ? (
          <div className="flex items-center gap-3 py-4 text-base">
            <Loader2 className="size-5 animate-spin" /> Creating the login…
          </div>
        ) : ok ? (
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-lg">
              <div>
                ID: <span className="font-mono font-semibold">{ok.username}</span>
              </div>
              <div>
                Password: <span className="font-mono font-semibold">{ok.password}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {ok.whatsappSent > 0
                ? `Sent on WhatsApp to ${ok.whatsappSent} number${ok.whatsappSent === 1 ? "" : "s"}.`
                : "Not sent on WhatsApp automatically, so send it yourself with the button below."}{" "}
              This password is shown only now.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold"
                >
                  <MessageCircle className="size-5" /> WhatsApp
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(text);
                  toast.success("Copied");
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold"
              >
                <Copy className="size-5" /> Copy
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-base">
            <p>
              The player is saved, but the login is not ready:{" "}
              {state.status === "failed" ? state.error : ""}.
            </p>
            <button
              type="button"
              onClick={() => student && void run(student.id)}
              className="h-12 w-full rounded-xl border border-border bg-card text-base font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={state.status === "working"}
          onClick={onClose}
          className="mt-1 h-12 w-full rounded-xl bg-foreground text-base font-semibold text-background disabled:opacity-50"
        >
          Done
        </button>
      </DialogContent>
    </Dialog>
  );
}
