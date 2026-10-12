import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { FeePreview, FormField, SelectField } from "@/components/students/add-student-fields";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/attendance/calendar";
import { enrollStudentInBilling, type FeePlanLite } from "@/lib/billing-enrollment";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchBatches, fetchFeePlans, qk } from "@/lib/dashboard-queries";
import { uploadTenantFile } from "@/lib/storage";
import {
  BATTING_STYLES,
  BLOOD_GROUPS,
  BOWLING_STYLES,
  PLAYING_ROLES,
} from "@/lib/students/constants";
import {
  NEW_STUDENT_SECTIONS,
  buildStudentInsert,
  canSubmitNewStudent,
  emptyNewStudentForm,
  type NewStudentForm,
  type NewStudentSection,
} from "@/lib/students/new-student";
import { cn } from "@/lib/utils";

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/**
 * The "Add player" form. Only name, mobile and session are needed; the
 * Cricket, Contact and Medical tabs are optional extras. Saving also puts the
 * player on their session's fee plan and raises the first bill.
 */
export function AddStudentForm({ onDone }: { onDone: () => void }) {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const batches = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const feePlans = useQuery({
    queryKey: qk.feePlans(tenant.id),
    queryFn: () => fetchFeePlans(tenant.id),
  });
  const plans = (feePlans.data ?? []) as FeePlanLite[];

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [section, setSection] = useState<NewStudentSection>("basic");
  // The joining date starts on the academy's own calendar day, not the UTC day.
  const [f, setF] = useState<NewStudentForm>(() => emptyNewStudentForm(todayISO()));
  const set = (key: keyof NewStudentForm) => (value: string) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // Free the browser's copy of the picked photo when it is replaced or the form closes.
  useEffect(() => {
    if (!photoPreview) return;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const save = useMutation({
    mutationFn: async () => {
      const photoUrl = photoFile ? await uploadTenantFile(tenant.id, "students", photoFile) : null;
      const payload = buildStudentInsert({
        tenantId: tenant.id,
        form: f,
        photoUrl,
        activationToken: crypto.randomUUID(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag the table
      const { data, error } = await (supabase.from("students") as any)
        .insert(payload)
        .select("id, player_id")
        .single();
      if (error) throw error;
      const row = data as { id: string; player_id: string };

      // Money follows the session: subscribe them to the session's fee plan and
      // raise the first bill (admission fee + first month) right away.
      let billed = false;
      try {
        const res = await enrollStudentInBilling({
          tenantId: tenant.id,
          studentId: row.id,
          feePlanId: f.fee_plan_id || null,
          plans,
          startDate: f.joined_at,
          gender: f.gender,
        });
        billed = !res.skipped;
      } catch {
        /* never block adding a player on billing */
      }
      return { ...row, billed };
    },
    onSuccess: (row) => {
      toast.success(`Added — Player ID ${row.player_id}`, {
        description: row.billed ? "First invoice created in Fees." : undefined,
      });
      qc.invalidateQueries({ queryKey: qk.students(tenant.id) });
      qc.invalidateQueries({ queryKey: qk.kpis(tenant.id) });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmitNewStudent(f) && !save.isPending) save.mutate();
      }}
    >
      <div className="flex justify-center">
        <label className="relative cursor-pointer group">
          <PersonAvatar
            name={f.name || "?"}
            src={photoPreview}
            className="h-20 w-20 ring-4 ring-white shadow-sm"
          />
          <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
            <Camera className="size-4" />
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Player photo"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) {
                setPhotoFile(picked);
                setPhotoPreview(URL.createObjectURL(picked));
              }
            }}
          />
        </label>
      </div>

      {/* Only "Required" must be filled; the other tabs are optional extras. */}
      <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-[11px] font-medium">
        {NEW_STUDENT_SECTIONS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              "flex-1 h-7 rounded-full transition-colors",
              section === key ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "basic" && (
        <>
          <FormField
            label="Player Name"
            placeholder="e.g. Rahul Sharma"
            required
            value={f.name}
            onChange={set("name")}
          />
          <FormField
            label="Mobile Number"
            placeholder="10 digit mobile"
            required
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={set("phone")}
          />

          <div className="space-y-1.5">
            <Label>Session / Batch</Label>
            <Select
              value={f.batch_id}
              onValueChange={(v) => {
                const b = (batches.data ?? []).find((x) => x.id === v);
                setF((prev) => ({ ...prev, batch_id: v, fee_plan_id: b?.fee_plan_id ?? "" }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {(batches.data ?? []).map((b) => {
                  const amt = plans.find((p) => p.id === b.fee_plan_id)?.amount;
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {amt ? ` · ₹${Number(amt).toLocaleString("en-IN")}/mo` : " · fee not set"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 items-end gap-2 opacity-60">
            <FormField
              label="Email (Optional)"
              type="email"
              value={f.email}
              onChange={set("email")}
            />
            <FormField
              label="Date of Birth (Optional)"
              type="date"
              value={f.dob}
              onChange={set("dob")}
            />
          </div>

          <FeePreview plans={plans} feePlanId={f.fee_plan_id} />

          <div className="grid grid-cols-2 items-end gap-2 opacity-60">
            <FormField
              label="Joining date"
              type="date"
              value={f.joined_at}
              onChange={set("joined_at")}
            />
            <FormField label="Coach" value={f.coach_name} onChange={set("coach_name")} />
          </div>
        </>
      )}

      {section === "cricket" && (
        <>
          <SelectField
            label="Playing role"
            value={f.playing_role}
            onChange={set("playing_role")}
            options={asOptions(PLAYING_ROLES)}
          />
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Batting style"
              value={f.batting_style}
              onChange={set("batting_style")}
              options={asOptions(BATTING_STYLES)}
            />
            <SelectField
              label="Bowling arm"
              value={f.bowling_arm}
              onChange={set("bowling_arm")}
              options={asOptions(["Right", "Left"])}
            />
          </div>
          <SelectField
            label="Bowling style"
            value={f.bowling_style}
            onChange={set("bowling_style")}
            options={asOptions(BOWLING_STYLES)}
          />
        </>
      )}

      {section === "contact" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="Parent name"
              value={f.guardian_name}
              onChange={set("guardian_name")}
            />
            <FormField
              label="Parent mobile"
              type="tel"
              inputMode="tel"
              value={f.guardian_phone}
              onChange={set("guardian_phone")}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="Emergency contact"
              value={f.emergency_contact_name}
              onChange={set("emergency_contact_name")}
            />
            <FormField
              label="Emergency phone"
              type="tel"
              inputMode="tel"
              value={f.emergency_contact_phone}
              onChange={set("emergency_contact_phone")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea rows={2} value={f.address} onChange={(e) => set("address")(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="City" value={f.city} onChange={set("city")} />
            <FormField label="State" value={f.state} onChange={set("state")} />
            <FormField
              label="Pincode"
              inputMode="numeric"
              value={f.pincode}
              onChange={set("pincode")}
            />
          </div>
          <FormField
            label="School / College"
            value={f.school_college}
            onChange={set("school_college")}
          />
        </>
      )}

      {section === "medical" && (
        <>
          <SelectField
            label="Blood group"
            value={f.blood_group}
            onChange={set("blood_group")}
            options={asOptions(BLOOD_GROUPS)}
          />
          <div className="space-y-1.5">
            <Label>Medical notes</Label>
            <Textarea
              rows={3}
              placeholder="Allergies, injuries, conditions the coach should know about"
              value={f.medical_notes}
              onChange={(e) => set("medical_notes")(e.target.value)}
            />
          </div>
        </>
      )}

      <Button
        type="submit"
        disabled={save.isPending || !canSubmitNewStudent(f)}
        className="w-full h-12 rounded-xl font-semibold shadow-md"
        style={{ backgroundColor: "var(--brand)", color: "var(--brand-ink)" }}
      >
        {save.isPending ? "Adding Player..." : "Add & Invite Player"}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        A Player ID like{" "}
        <span className="font-mono">
          {tenant.player_prefix ?? "SSA"}-{new Date().getFullYear()}-0001
        </span>{" "}
        will be assigned automatically.
      </p>
    </form>
  );
}
