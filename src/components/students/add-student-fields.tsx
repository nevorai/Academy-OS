import type { HTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { previewEnrollmentCharges, type FeePlanLite } from "@/lib/billing-enrollment";

/** A labelled text box. `min-w-0` lets two of them share a row on a phone without overflowing. */
export function FormField({
  label,
  value,
  onChange,
  required,
  type,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      <Input
        type={type}
        inputMode={inputMode}
        value={value}
        required={required}
        placeholder={placeholder}
        className="h-11"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** A labelled dropdown. */
export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Live "what will this player be charged" summary under the session picker. */
export function FeePreview({ plans, feePlanId }: { plans: FeePlanLite[]; feePlanId: string }) {
  const { plan, admission, recurring, oneTime, total } = previewEnrollmentCharges(
    plans,
    feePlanId || null,
    true,
  );
  if (!plan) return null;
  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-sm space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">First bill</div>
      {admission && oneTime > 0 ? (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">{admission.name} (one-time)</span>
          <span className="font-medium">{inr(oneTime)}</span>
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{plan.name}</span>
        <span className="font-medium">{inr(recurring)}</span>
      </div>
      <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
        <span>Total due now</span>
        <span>{inr(total)}</span>
      </div>
    </div>
  );
}
