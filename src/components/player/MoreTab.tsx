import { useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileText, Layers, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ds/Card";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { DangerZone } from "@/components/shared/DangerZone";
import { usePermissions } from "@/hooks/use-permissions";
import type { PlayerStudent } from "@/hooks/use-player-profile";
import { removeStudent } from "@/lib/removal";
import { AccessRoleCard } from "./AccessRoleCard";
import { BrandIconBox } from "./parts";

type Row = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  soon?: boolean;
};

/** Contact details, the owner-only access card, and the "remove player" danger zone. */
export function MoreTab({ student, tenantId }: { student: PlayerStudent; tenantId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { isOwner } = usePermissions();

  const rows: Row[] = [
    { icon: FileText, label: "Registration form", value: "View original registration", soon: true },
    { icon: BadgeCheck, label: "Certificates", value: "Awards & certificates", soon: true },
    { icon: ShieldAlert, label: "Medical", value: "Health & injury records", soon: true },
    {
      icon: Phone,
      label: "Emergency contact",
      value: student.guardian_name
        ? `${student.guardian_name}${student.guardian_phone ? ` · ${student.guardian_phone}` : ""}`
        : "Not on file",
    },
    { icon: MessageCircle, label: "Address", value: student.address ?? "Not on file" },
    { icon: Layers, label: "Documents", value: "ID card, report card", soon: true },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.label} className="p-3.5 flex items-center gap-3">
            <BrandIconBox icon={r.icon} className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-[11px] text-muted-foreground truncate">{r.value}</div>
            </div>
            {r.soon ? (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Soon
              </span>
            ) : null}
          </Card>
        ))}
      </div>

      {isOwner && student.user_id ? (
        <AccessRoleCard tenantId={tenantId} studentUserId={student.user_id} />
      ) : null}

      <DangerZone
        visible={isOwner}
        description="Permanently remove this player from the academy. This cannot be undone."
        actions={[
          {
            label: "Remove player",
            description:
              "Deletes attendance, fees, registrations, match records and the player profile.",
            onClick: () => setConfirmOpen(true),
          },
        ]}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove player permanently"
        description="This permanently removes this player and all academy data — attendance, fees, registrations and match history."
        confirmText={student.name}
        confirmLabel="Remove player"
        onConfirm={async () => {
          try {
            await removeStudent(student.id, student.name);
            toast.success("Player removed");
            await qc.invalidateQueries();
            navigate({ to: "/dashboard/students" });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to remove player");
            throw e;
          }
        }}
      />
    </div>
  );
}
