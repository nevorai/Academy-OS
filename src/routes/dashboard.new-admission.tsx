import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchBatches, fetchFeePlans, qk } from "@/lib/dashboard-queries";
import { enrollStudentInBilling, type FeePlanLite } from "@/lib/billing-enrollment";
import { newIdempotencyKey, recordPayment } from "@/lib/billing";
import { periodKey, whatsappLink } from "@/lib/fees";
import { todayISO } from "@/lib/attendance/calendar";
import { buildStudentInsert, emptyNewStudentForm } from "@/lib/students/new-student";
import { createStudentLogins } from "@/lib/admissions/logins.functions";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { checkMobile } from "@/lib/students/mobile-check";

export const Route = createFileRoute("/dashboard/new-admission")({
  head: () => ({ meta: [{ title: "New admission" }, { name: "robots", content: "noindex" }] }),
  // An enquiry from the website can open this page with the name and phone already filled in.
  validateSearch: (s: Record<string, unknown>): { name?: string; phone?: string } => ({
    name: typeof s.name === "string" ? s.name : undefined,
    phone: typeof s.phone === "string" ? s.phone : undefined,
  }),
  component: NewAdmission,
});

type Done = {
  studentId: string;
  name: string;
  phone: string;
  paid: boolean;
  billed: boolean;
};

/** The login is made after the player is saved, so the screen never waits on it. */
type LoginState =
  | { status: "working" }
  | { status: "ok"; password: string; url: string; whatsappSent: number }
  | { status: "failed"; error: string };

const LOGIN_WAIT_MS = 45_000;

const FIELD_ERROR = "border-red-500 focus:ring-red-500";

const FIELD =
  "h-14 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-[color:var(--brand)]";

function NewAdmission() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const createLogins = useServerFn(createStudentLogins);

  const batches = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const feePlans = useQuery({
    queryKey: qk.feePlans(tenant.id),
    queryFn: () => fetchFeePlans(tenant.id),
  });
  const plans = (feePlans.data ?? []) as FeePlanLite[];
  const batchList = (batches.data ?? []) as Array<{
    id: string;
    name: string;
    active?: boolean;
    fee_plan_id: string | null;
  }>;

  const [name, setName] = useState(search.name ?? "");
  const [phone, setPhone] = useState(search.phone ?? "");
  const [batchId, setBatchId] = useState("");
  const [paid, setPaid] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [login, setLogin] = useState<LoginState>({ status: "working" });

  // Phone number = ID, random password. Sent on WhatsApp and shown once. Safe to repeat: a player who already has a login is skipped.
  const makeLogin = async (studentId: string) => {
    setLogin({ status: "working" });
    try {
      const out = await Promise.race([
        createLogins({
          data: {
            tenantId: tenant.id,
            studentIds: [studentId],
            sendEmail: false,
            sendWhatsApp: true,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("This is taking too long")), LOGIN_WAIT_MS),
        ),
      ]);
      const r = out.results[0];
      if (r?.status === "created") {
        setLogin({
          status: "ok",
          password: r.password,
          url: out.loginUrl,
          whatsappSent: r.whatsappSent,
        });
      } else if (!r && out.skippedHaveLogin > 0) {
        setLogin({
          status: "failed",
          error: "This player already has a login. Use Reset login on the player page.",
        });
      } else {
        setLogin({ status: "failed", error: r?.error ?? "Login was not created" });
      }
    } catch (e) {
      setLogin({
        status: "failed",
        error: e instanceof Error ? e.message : "Login was not created",
      });
    }
  };

  const mobile = checkMobile(phone);
  const digits = mobile.digits;
  const nameOk = name.trim().length >= 2;
  const valid = nameOk && mobile.ok;
  // Errors show once the owner has typed in the field or tried to submit, so an empty form is not red at the start.
  const [tried, setTried] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const showPhoneError = !mobile.ok && (tried || phoneTouched || phone.length > 0);
  const showNameError = !nameOk && (tried || nameTouched);
  const batch = batchList.find((b) => b.id === batchId);
  const plan = batch?.fee_plan_id ? plans.find((p) => p.id === batch.fee_plan_id) : undefined;
  const planAmount = Number((plan as { amount?: number | null } | undefined)?.amount ?? 0);

  const save = useMutation({
    mutationFn: async (): Promise<Done> => {
      const form = {
        ...emptyNewStudentForm(todayISO()),
        name: name.trim(),
        phone: digits,
        batch_id: batchId,
        fee_plan_id: batch?.fee_plan_id ?? "",
      };
      const payload = buildStudentInsert({
        tenantId: tenant.id,
        form,
        photoUrl: null,
        activationToken: crypto.randomUUID(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the table
      const { data, error } = await (supabase.from("students") as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      const studentId = (data as { id: string }).id;

      // A new admission pays the one-time admission fee plus the first month.
      let billed = false;
      try {
        const res = await enrollStudentInBilling({
          tenantId: tenant.id,
          studentId,
          feePlanId: batch?.fee_plan_id ?? null,
          plans,
          chargeAdmission: true,
          startDate: form.joined_at,
        });
        billed = !res.skipped;
      } catch {
        /* never block an admission on billing */
      }

      // "First month already paid": record the cash now, so Fees shows them as paid.
      let paidNow = false;
      if (paid && planAmount > 0) {
        try {
          await recordPayment({
            tenant_id: tenant.id,
            student_id: studentId,
            amount: planAmount,
            method: "cash",
            allocations: [],
            collected_at: new Date().toISOString(),
            remarks: `[period:${periodKey(new Date())}] [type:monthly]`,
            idempotency_key: newIdempotencyKey(),
          });
          paidNow = true;
        } catch {
          toast.error("Player added, but the payment was not saved. Record it in Fees.");
        }
      }

      return { studentId, name: name.trim(), phone: form.phone, paid: paidNow, billed };
    },
    onSuccess: (d) => {
      setDone(d);
      void makeLogin(d.studentId);
      qc.invalidateQueries({ queryKey: qk.students(tenant.id) });
      qc.invalidateQueries({ queryKey: qk.kpis(tenant.id) });
      qc.invalidateQueries({ queryKey: ["d", "fees"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not add the player"),
  });

  const reset = () => {
    setName("");
    setPhone("");
    setBatchId("");
    setPaid(false);
    setDone(null);
    setLogin({ status: "working" });
  };

  if (done)
    return (
      <Result
        d={done}
        login={login}
        academy={tenant.name}
        onAgain={reset}
        onRetry={() => void makeLogin(done.studentId)}
      />
    );

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-1 pb-24">
      <ModuleHeader title="New admission" overline="Players" backTo="/dashboard" />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (save.isPending) return;
          if (!valid) {
            setTried(true);
            return;
          }
          save.mutate();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Player name</span>
          <input
            className={cn(FIELD, showNameError && FIELD_ERROR)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            autoComplete="off"
            placeholder="Full name"
            aria-invalid={showNameError}
          />
          {showNameError ? (
            <p className="text-sm font-medium text-red-600">Enter the player's name</p>
          ) : null}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Phone number</span>
          <input
            className={cn(FIELD, showPhoneError && FIELD_ERROR)}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhoneTouched(true)}
            inputMode="tel"
            autoComplete="off"
            placeholder="10-digit mobile (this is the login ID)"
            aria-invalid={showPhoneError}
          />
          {showPhoneError ? (
            <p className="text-sm font-medium text-red-600">{mobile.message}</p>
          ) : mobile.ok ? (
            <p className="text-sm text-emerald-600">Login ID will be {digits}</p>
          ) : null}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">
            Batch <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <select className={FIELD} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Choose later</option>
            {batchList
              .filter((b) => b.active !== false)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          {planAmount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Monthly fee ₹{planAmount.toLocaleString("en-IN")}. The admission fee is added
              automatically.
            </p>
          ) : null}
        </label>

        {planAmount > 0 ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <div className="text-base font-semibold">First month already paid</div>
              <div className="text-sm text-muted-foreground">Cash received now</div>
            </div>
            <Switch checked={paid} onCheckedChange={setPaid} className="scale-125" />
          </div>
        ) : null}

        {tried && !valid ? (
          <p className="text-center text-sm font-medium text-red-600">
            Please fix the red fields above, then tap Admit player.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={save.isPending}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold disabled:opacity-50"
          style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <UserPlus className="size-5" />
          {save.isPending ? "Adding…" : "Admit player"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          The player gets a login on WhatsApp. They sign in, fill the rest of their details and
          reach their own dashboard.
        </p>
      </form>
    </div>
  );
}

function Result({
  d,
  login,
  academy,
  onAgain,
  onRetry,
}: {
  d: Done;
  login: LoginState;
  academy: string;
  onAgain: () => void;
  onRetry: () => void;
}) {
  const ok = login.status === "ok" ? login : null;
  const text = ok
    ? `Welcome to ${academy}!\nLogin ID: ${d.phone}\nPassword: ${ok.password}\nSign in: ${ok.url}\nPlease fill your details after you sign in. You can change the password there.`
    : "";
  const wa = ok ? whatsappLink(d.phone, text) : null;
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-1 pb-24">
      <section className="rounded-xl border border-border bg-card p-5">
        <CheckCircle2 className="mb-2 size-8 text-emerald-600" />
        <h1 className="text-xl font-semibold">{d.name} is admitted</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {d.billed ? "Fee entry created in Fees." : "No fee plan chosen, so no fee entry yet."}
          {d.paid ? " First month marked paid." : ""}
        </p>
      </section>

      {login.status === "working" ? (
        <section className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 text-base">
          <Loader2 className="size-5 animate-spin" /> Creating the login…
        </section>
      ) : ok ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Login</h2>
          <div className="space-y-1 text-lg">
            <div>
              ID: <span className="font-mono font-semibold">{d.phone}</span>
            </div>
            <div>
              Password: <span className="font-mono font-semibold">{ok.password}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {ok.whatsappSent > 0
              ? `Sent on WhatsApp to ${ok.whatsappSent} number${ok.whatsappSent === 1 ? "" : "s"}.`
              : "WhatsApp is not connected or switched off, so send it yourself with the button below."}{" "}
            This password is shown only now.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
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
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-base">
          <p>
            The player is saved, but the login is not ready:{" "}
            {login.status === "failed" ? login.error : ""}.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="h-12 w-full rounded-xl border border-border bg-card text-base font-semibold"
          >
            Try again
          </button>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="h-14 rounded-xl text-base font-semibold"
          style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
        >
          Add another
        </button>
        <Link
          to="/dashboard/students/$id"
          params={{ id: d.studentId }}
          className="flex h-14 items-center justify-center rounded-xl border border-border text-base font-semibold"
        >
          Open player
        </Link>
      </div>
    </div>
  );
}
