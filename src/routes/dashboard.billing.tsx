import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { Card } from "@/components/ds/Card";
import { useDashboard } from "@/lib/dashboard-context";
import { getBillingUrl } from "@/lib/kaizen-billing.functions";

// Nevorai plan billing lives ONLY at billing.nevorai.com (Nevorai Kaizen). This page is the one hop there:
// it asks the server for the (signed-in, one-time) address and leaves. The plan, limits and usage stay on
// /dashboard/subscription; money the parents pay the academy never comes through here.
export const Route = createFileRoute("/dashboard/billing")({
  validateSearch: z.object({ plan: z.enum(["starter", "professional", "enterprise"]).optional() }),
  head: () => ({
    meta: [{ title: "Billing · Nevorai Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <OwnerOnly>
      <BillingHop />
    </OwnerOnly>
  ),
});

function BillingHop() {
  const { tenant } = useDashboard();
  const { plan } = Route.useSearch();
  const go = useServerFn(getBillingUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    go({ data: { tenantId: tenant.id, plan } })
      .then((r) => {
        if (alive) window.location.assign(r.url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [go, tenant.id, plan]);

  return (
    <Card className="p-6 max-w-xl">
      <h1 className="text-lg font-semibold">Billing</h1>
      {failed ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Billing could not be opened. Please try again, or write to hello@nevorai.com.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Opening billing.nevorai.com…</p>
      )}
      <a className="mt-3 inline-block text-sm underline" href="/dashboard/subscription">
        Back to my plan
      </a>
    </Card>
  );
}
