import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ui/button";
import { listTenantMembers, setStaffRole } from "@/lib/staff/staff.functions";
import { BrandIconBox } from "./parts";

/** Lets the owner give a player (who has a login) admin access, or take it away again. */
export function AccessRoleCard({
  tenantId,
  studentUserId,
}: {
  tenantId: string;
  studentUserId: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listTenantMembers);
  const setRoleFn = useServerFn(setStaffRole);
  const rolesQ = useQuery({
    queryKey: ["student-roles", tenantId, studentUserId],
    queryFn: async () => {
      const rows = (await list({ data: { tenantId } })) as Array<{
        user_id: string;
        roles: string[];
        profile_role: string | null;
      }>;
      const me = rows.find((r) => r.user_id === studentUserId);
      return { roles: me?.roles ?? [], profile_role: me?.profile_role ?? null };
    },
  });

  const m = useMutation({
    mutationFn: (make: boolean) =>
      setRoleFn({
        data: {
          tenantId,
          userId: studentUserId,
          newRole: make ? "admin" : "student",
          oldRole: make ? "student" : "admin",
        },
      }),
    onSuccess: (_res, make) => {
      toast.success(make ? "Assigned as admin" : "Admin access removed");
      qc.invalidateQueries({ queryKey: ["student-roles", tenantId, studentUserId] });
      qc.invalidateQueries({ queryKey: ["admins", "members", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roles = rolesQ.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  if (roles.includes("owner") || rolesQ.data?.profile_role === "owner") return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <BrandIconBox icon={ShieldCheck} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Access & role</div>
          <div className="text-[11px] text-muted-foreground">
            {isAdmin
              ? "This student has admin access to the academy."
              : "Give this student admin access to manage the academy."}
          </div>
        </div>
        <Button
          size="sm"
          variant={isAdmin ? "outline" : "default"}
          onClick={() => m.mutate(!isAdmin)}
          disabled={m.isPending || rolesQ.isLoading}
        >
          {m.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isAdmin ? (
            "Remove admin"
          ) : (
            "Make admin"
          )}
        </Button>
      </div>
    </Card>
  );
}
