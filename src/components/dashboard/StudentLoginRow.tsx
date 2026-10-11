import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, MessageCircle } from "lucide-react";
import { toE164 } from "@/lib/phone";
import { createStudentLogins, resetStudentLogin } from "@/lib/admissions/logins.functions";
import { Button } from "@/components/ui/button";

type Shown = {
  username: string;
  password: string;
  phone: string | null;
  guardianPhone: string | null;
  name: string;
  academy: string;
  url: string;
  emailSent: boolean;
};

/**
 * Login row for the player profile. Passwords are never stored or shown again:
 * "Reset login" makes a new temporary password the owner can pass on once.
 */
export function StudentLoginRow({
  tenantId,
  studentId,
  playerId,
  hasLogin,
  onChanged,
}: {
  tenantId: string;
  studentId: string;
  playerId: string | null;
  hasLogin: boolean;
  onChanged?: () => void;
}) {
  const create = useServerFn(createStudentLogins);
  const reset = useServerFn(resetStudentLogin);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);

  const act = async () => {
    setBusy(true);
    try {
      if (hasLogin) {
        const r = await reset({ data: { tenantId, studentId, sendEmail: true } });
        setShown({
          username: r.username,
          password: r.password,
          phone: r.phone,
          guardianPhone: r.guardianPhone,
          name: r.name,
          academy: r.academy,
          url: r.loginUrl,
          emailSent: r.emailSent,
        });
      } else {
        const r = await create({ data: { tenantId, studentIds: [studentId], sendEmail: true } });
        const one = r.results[0];
        if (!one || one.status === "failed") throw new Error(one?.error ?? "Could not create the login");
        setShown({
          username: one.username,
          password: one.password,
          phone: one.phone,
          guardianPhone: one.guardianPhone,
          name: one.name,
          academy: r.academy,
          url: r.loginUrl,
          emailSent: one.emailSent,
        });
      }
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const wa = (() => {
    if (!shown) return null;
    const num = toE164(shown.phone ?? "") ?? toE164(shown.guardianPhone ?? "");
    if (!num) return null;
    const msg =
      `Hi ${shown.name}, your ${shown.academy} login:\nPlayer ID: ${shown.username}\n` +
      `Password: ${shown.password}\nSign in: ${shown.url}\nYou will choose your own password the first time.`;
    return `https://wa.me/${num.replace("+", "")}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 border-b border-border/40 px-4 py-3 last:border-b-0">
      <dt className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Login</dt>
      <dd className="space-y-2 font-medium text-foreground">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            {hasLogin ? (
              <>
                Player ID <span className="font-mono">{playerId ?? "—"}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No login yet</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px] text-primary"
            disabled={busy}
            onClick={() => void act()}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <KeyRound className="mr-1 size-3" />}
            {hasLogin ? "Reset login" : "Create login"}
          </Button>
        </div>
        {shown && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="font-mono text-[13px]">
              {shown.username} · {shown.password}
            </div>
            <p className="text-muted-foreground">
              Shown only now. {shown.emailSent ? "Also emailed. " : ""}The player chooses their own
              password at first sign-in.
            </p>
            {wa && (
              <Button asChild size="sm" variant="outline" className="h-8">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-1 size-4" /> Send on WhatsApp
                </a>
              </Button>
            )}
          </div>
        )}
      </dd>
    </div>
  );
}
