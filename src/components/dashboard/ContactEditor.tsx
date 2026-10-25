import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { uploadTenantFile, signedUrl } from "@/lib/storage";
import type { Tenant } from "@/lib/tenant";

/**
 * Contact, UPI, logo, short name and the printable registration form of one academy.
 * Lives on the platform-admin tenant page (the academy owner no longer edits these).
 */
export function ContactEditor({ tenant, onSaved }: { tenant: Tenant; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    phone: tenant.phone ?? "",
    whatsapp: tenant.whatsapp ?? "",
    email: tenant.email ?? "",
    address: tenant.address ?? "",
    upi_id: tenant.upi_id ?? "",
    upi_qr_url: tenant.upi_qr_url ?? "",
    tagline: tenant.tagline ?? "",
    logo_url: tenant.logo_url ?? "",
    short_name: (tenant as any).short_name ?? "",
    registration_pdf_url: (tenant as any).registration_pdf_url ?? "",
  });
  const [qrPreview, setQrPreview] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [pdfPreview, setPdfPreview] = useState<string>("");
  useEffect(() => {
    if (form.upi_qr_url) signedUrl(form.upi_qr_url).then(setQrPreview);
    else setQrPreview("");
  }, [form.upi_qr_url]);
  useEffect(() => {
    if (form.logo_url) signedUrl(form.logo_url).then(setLogoPreview);
    else setLogoPreview("");
  }, [form.logo_url]);
  useEffect(() => {
    if (form.registration_pdf_url) signedUrl(form.registration_pdf_url).then(setPdfPreview);
    else setPdfPreview("");
  }, [form.registration_pdf_url]);


  const invalidateTenant = () => {
    onSaved?.();
    qc.invalidateQueries({ queryKey: ["dashboard-tenant", tenant.id] });
    qc.invalidateQueries({ queryKey: ["current-tenant"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      // Only push the text/branding fields the form actually edits. File
      // fields (logo_url, upi_qr_url, registration_pdf_url) are written
      // directly by upload()/remove() and must NOT be re-sent here — a stale
      // form snapshot would otherwise wipe a just-uploaded PDF/QR/logo.
      const { logo_url: _l, upi_qr_url: _q, registration_pdf_url: _p, ...editable } = form;
      const { error } = await supabase
        .from("tenants")
        .update(editable as any)
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      invalidateTenant();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function upload(
    field: "upi_qr_url" | "logo_url" | "registration_pdf_url",
    file: File,
  ) {
    try {
      const folder = field === "registration_pdf_url" ? "public/registration-pdf" : field;
      const path = await uploadTenantFile(tenant.id, folder, file);
      const next = { ...form, [field]: path };
      setForm(next);
      const { error } = await supabase
        .from("tenants")
        .update({ [field]: path } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      toast.success(
        field === "logo_url"
          ? "Logo updated"
          : field === "registration_pdf_url"
            ? "Registration PDF updated"
            : "QR updated",
      );
      invalidateTenant();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(field: "upi_qr_url" | "logo_url" | "registration_pdf_url") {
    try {
      const next = { ...form, [field]: "" };
      setForm(next);
      const { error } = await supabase
        .from("tenants")
        .update({ [field]: null } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      toast.success(
        field === "logo_url"
          ? "Logo removed"
          : field === "registration_pdf_url"
            ? "Registration PDF removed"
            : "QR removed",
      );
      invalidateTenant();
    } catch (e: any) {
      toast.error(e.message);
    }
  }



  return (
    <Card className="p-5 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field
          label="WhatsApp"
          value={form.whatsapp}
          onChange={(v) => setForm({ ...form, whatsapp: v })}
        />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field
          label="Tagline"
          value={form.tagline}
          onChange={(v) => setForm({ ...form, tagline: v })}
        />
        <div className="space-y-1.5 md:col-span-2">
          <Label>
            Short name{" "}
            <span className="text-xs text-muted-foreground">
              (shown when app is added to phone home screen — max 12 chars)
            </span>
          </Label>
          <Input
            value={form.short_name}
            maxLength={12}
            placeholder="Sai Sports"
            onChange={(e) => setForm({ ...form, short_name: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Textarea
          rows={2}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 pt-2 border-t">
        <div className="space-y-2">
          <Label>UPI ID</Label>
          <Input
            value={form.upi_id}
            onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
            placeholder="yourupi@bank"
          />
          <Label className="text-xs">UPI QR image</Label>
          <div className="flex items-center gap-3">
            {qrPreview && <img src={qrPreview} alt="" className="size-16 rounded border" />}
            <label className="text-xs cursor-pointer inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Upload className="size-3" /> {form.upi_qr_url ? "Replace QR" : "Upload QR"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload("upi_qr_url", e.target.files[0])}
              />
            </label>
            {form.upi_qr_url ? (
              <button
                type="button"
                onClick={() => remove("upi_qr_url")}
                className="text-xs text-muted-foreground hover:text-rose-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoPreview && <img src={logoPreview} alt="" className="size-16 rounded border" />}
            <label className="text-xs cursor-pointer inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Upload className="size-3" /> {form.logo_url ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload("logo_url", e.target.files[0])}
              />
            </label>
            {form.logo_url ? (
              <button
                type="button"
                onClick={() => remove("logo_url")}
                className="text-xs text-muted-foreground hover:text-rose-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t space-y-2">
        <Label>Offline registration PDF</Label>
        <p className="text-xs text-muted-foreground">
          Upload the printable admission form. When present, the public website's{" "}
          <strong>Offline PDF form</strong> button downloads this file. If nothing is uploaded,
          the button is hidden automatically.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs cursor-pointer inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-foreground hover:bg-muted">
            <Upload className="size-3" />
            {form.registration_pdf_url ? "Replace PDF" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && upload("registration_pdf_url", e.target.files[0])
              }
            />
          </label>
          {form.registration_pdf_url && pdfPreview ? (
            <a
              href={pdfPreview}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Preview current PDF
            </a>
          ) : null}
          {form.registration_pdf_url ? (
            <button
              type="button"
              onClick={() => remove("registration_pdf_url")}
              className="text-xs text-muted-foreground hover:text-rose-600"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>



      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ backgroundColor: "var(--brand)", color: "white" }}
        >
          Save contact & branding
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
