import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, KeyRound, Loader2, MessageCircle, Check, AlertTriangle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { qk } from "@/lib/dashboard-queries";
import { toE164 } from "@/lib/phone";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  createStudentLogins,
  LOGIN_CHUNK,
  type LoginResult,
} from "@/lib/admissions/logins.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Pending = { id: string; name: string };

function whatsappLink(r: LoginResult, academy: string, url: string): string | null {
  const num = toE164(r.phone ?? "") ?? toE164(r.guardianPhone ?? "");
  if (!num) return null;
  const msg =
    `Hi ${r.name}, welcome to ${academy}!\n` +
    `Your login:\nPlayer ID: ${r.username}\nPassword: ${r.password}\n` +
    `Sign in: ${url}\nYou will choose your own password the first time.`;
  return `https://wa.me/${num.replace("+", "")}?text=${encodeURIComponent(msg)}`;
}

function CreateLoginsInner() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const create = useServerFn(createStudentLogins);
  const [open, setOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [phase, setPhase] = useState<"intro" | "running" | "done">("intro");
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<LoginResult[]>([]);
  const [meta, setMeta] = useState<{ academy: string; url: string; emailConfigured: boolean } | null>(
    null,
  );

  const pending = useQuery({
    enabled: open && phase === "intro",
    queryKey: ["students-without-login", tenant.id],
    queryFn: async (): Promise<Pending[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .is("user_id", null)
        .neq("status", "archived")
        .order("name")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Pending[];
    },
  });
  const list = pending.data ?? [];

  const run = async () => {
    setPhase("running");
    setDone(0);
    setResults([]);
    const all: LoginResult[] = [];
    try {
      for (let i = 0; i < list.length; i += LOGIN_CHUNK) {
        const ids = list.slice(i, i + LOGIN_CHUNK).map((s) => s.id);
        const res = await create({ data: { tenantId: tenant.id, studentIds: ids, sendEmail } });
        all.push(...res.results);
        setResults([...all]);
        setDone(Math.min(list.length, i + LOGIN_CHUNK));
        setMeta({ academy: res.academy, url: res.loginUrl, emailConfigured: res.emailConfigured });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Already created logins are listed below.");
    }
    void qc.invalidateQueries({ queryKey: qk.students(tenant.id) });
    setPhase("done");
  };

  const created = results.filter((r) => r.status === "created");
  const failed = results.filter((r) => r.status === "failed");
  const emailed = created.filter((r) => r.emailSent).length;

  const download = () => {
    const rows = created.map((r) => ({
      Name: r.name,
      "Player ID": r.username,
      "Temporary password": r.password,
      Phone: r.phone ?? "",
      "Guardian phone": r.guardianPhone ?? "",
      Email: r.email ?? "",
      "Emailed": r.emailSent ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logins");
    XLSX.writeFile(wb, `player-logins-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const copyAll = async () => {
    if (!meta) return;
    const text = created
      .map(
        (r) =>
          `${r.name}: Player ID ${r.username} · Password ${r.password}`,
      )
      .join("\n");
    await navigator.clipboard.writeText(`${meta.academy} logins\nSign in: ${meta.url}\n\n${text}`);
    toast.success("Copied");
  };

  const cantEmail = useMemo(() => meta && !meta.emailConfigured, [meta]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Never close mid-run: passwords are shown only once.
        if (phase === "running") return;
        setOpen(v);
        if (!v) {
          setPhase("intro");
          setResults([]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full h-9">
          <KeyRound className="size-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Create logins</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Player logins</DialogTitle>
          <DialogDescription>
            Every player gets a Player ID and a temporary password. They sign in with the Player ID,
            their email or their phone, and choose their own password the first time.
          </DialogDescription>
        </DialogHeader>

        {phase === "intro" && (
          <div className="space-y-4">
            {pending.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Checking players…
              </div>
            ) : list.length === 0 ? (
              <p className="rounded-xl border bg-muted/40 p-4 text-sm">
                Everyone already has a login. To give someone a new password, open the player and use
                Reset login.
              </p>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                  <b>{list.length}</b> player{list.length === 1 ? "" : "s"} without a login:{" "}
                  <span className="text-muted-foreground">
                    {list.slice(0, 5).map((s) => s.name).join(", ")}
                    {list.length > 5 ? ` and ${list.length - 5} more` : ""}
                  </span>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  <span>
                    Also email the login to players who have an email address.
                    <span className="block text-xs text-muted-foreground">
                      WhatsApp is one tap per player on the next screen.
                    </span>
                  </span>
                </label>
                <Button className="w-full" onClick={() => void run()}>
                  Create {list.length} login{list.length === 1 ? "" : "s"}
                </Button>
              </>
            )}
          </div>
        )}

        {phase === "running" && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Creating logins… {done} of {list.length}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Keep this window open until it finishes.</p>
          </div>
        )}

        {phase === "done" && meta && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <Check className="size-4" /> {created.length} created
              </span>
              {emailed > 0 && <span>{emailed} emailed</span>}
              {failed.length > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                  <AlertTriangle className="size-4" /> {failed.length} failed
                </span>
              )}
            </div>
            {cantEmail && sendEmail && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                Email is not set up yet for this academy, so no emails went out. Use WhatsApp or the
                Excel file below.
              </p>
            )}
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              Passwords are shown only now and are not saved anywhere. Share them, then close this
              window. If you download the file, delete it after sharing.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={download} disabled={created.length === 0}>
                <Download className="mr-1.5 size-4" /> Download Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copyAll()} disabled={created.length === 0}>
                <Copy className="mr-1.5 size-4" /> Copy all
              </Button>
            </div>
            <ul className="divide-y rounded-xl border">
              {results.map((r) => {
                const wa = r.status === "created" ? whatsappLink(r, meta.academy, meta.url) : null;
                return (
                  <li key={r.studentId} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.name}</div>
                      {r.status === "created" ? (
                        <div className="truncate font-mono text-[12px] text-muted-foreground">
                          {r.username} · {r.password}
                          {r.emailSent ? " · emailed" : ""}
                        </div>
                      ) : (
                        <div className="truncate text-[12px] text-destructive">{r.error ?? "Failed"}</div>
                      )}
                    </div>
                    {wa ? (
                      <Button asChild size="sm" variant="outline" className="h-8 shrink-0">
                        <a href={wa} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="mr-1 size-4" /> WhatsApp
                        </a>
                      </Button>
                    ) : r.status === "created" ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">no phone</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Owners and admins only; the server checks the same. */
export function CreateLoginsDialog() {
  const role = useCurrentRole();
  if (role !== "owner" && role !== "admin") return null;
  return <CreateLoginsInner />;
}
