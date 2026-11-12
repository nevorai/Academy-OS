import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Copy, MessageCircle, UserPlus } from "lucide-react";
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
  password: string | null;
  url: string;
  whatsappSent: number;
  loginError: string | null;
  paid: boolean;
  billed: boolean;
};

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

  const digits = phone.replace(/\D/g, "");
  const valid = name.trim().length >= 2 && digits.length >= 10;
  const batch = batchList.find((b) => b.id === batchId);
  const plan = batch?.fee_plan_id ? plans.find((p) => p.id === batch.fee_plan_id) : undefined;
  const planAmount = Number((plan as { amount?: number | null } | undefined)?.amount ?? 0);

  const save = useMutation({
    mutationFn: async (): Promise<Done> => {
      const form = {
        ...emptyNewStudentForm(todayISO()),
        name: name.trim(),
        phone: digits.length === 10 ? digits : phone.trim(),
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

      // Login: the phone number is the ID, the password is random. It goes to WhatsApp and is shown once here.
      let password: string | null = null;
      let url = "";
      let whatsappSent = 0;
      let loginError: string | null = null;
      try {
        const out = await createLogins({
          data: {
            tenantId: tenant.id,
            studentIds: [studentId],
            sendEmail: false,
            sendWhatsApp: true,
          },
        });
        url = out.loginUrl;
        const r = out.results[0];
        if (r?.status === "created") {
          password = r.password;
          whatsappSent = r.whatsappSent;
        } else {
          loginError = r?.error ?? "Login was not created";
        }
      } catch (e) {
        loginError = e instanceof Error ? e.message : "Login was not created";
      }
      return {
        studentId,
        name: name.trim(),
        phone: form.phone,
        password,
        url,
        whatsappSent,
        loginError,
        paid: paidNow,
        billed,
      };
    },
    onSuccess: (d) => {
      setDone(d);
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
  };

  if (done) return <Result d={done} academy={tenant.name} onAgain={reset} />;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-1 pb-24">
      <ModuleHeader title="New admission" overline="Players" backTo="/dashboard" />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !save.isPending) save.mutate();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Player name</span>
          <input
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Full name"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Phone number</span>
          <input
            className={FIELD}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="10-digit mobile (this is the login ID)"
          />
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

        <button
          type="submit"
          disabled={!valid || save.isPending}
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

function Result({ d, academy, onAgain }: { d: Done; academy: string; onAgain: () => void }) {
  const text = d.password
    ? `Welcome to ${academy}!\nLogin ID: ${d.phone}\nPassword: ${d.password}\nSign in: ${d.url}\nPlease fill your details after you sign in. You can change the password there.`
    : "";
  const wa = d.password ? whatsappLink(d.phone, text) : null;
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

      {d.password ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Login</h2>
          <div className="space-y-1 text-lg">
            <div>
              ID: <span className="font-mono font-semibold">{d.phone}</span>
            </div>
            <div>
              Password: <span className="font-mono font-semibold">{d.password}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {d.whatsappSent > 0
              ? `Sent on WhatsApp to ${d.whatsappSent} number${d.whatsappSent === 1 ? "" : "s"}.`
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
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-base">
          The player was added but the login could not be created ({d.loginError}). Open the player
          and create the login from there.
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
