"use client";

import Link from "next/link";
import type { CloudWorkspaceSummary } from "@repo/contracts";
import { PLANS, type PlanTierId } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CapacitySummary } from "@/components/shared/CapacitySummary";
import { workspaceBillingHref } from "@/components/billing/BillingWorkspaceContext";
import { PlanIcon } from "@/components/billing/PlanIcon";
import type { ManagedServerActions } from "./useManagedServerActions";

export function ManagedServerPlan({
  server,
  actions,
}: {
  server: CloudWorkspaceSummary;
  actions: ManagedServerActions;
}) {
  const { t } = useI18n();
  const copy = t.billing.workspaces;
  const plan = Object.hasOwn(PLANS, server.planTierId)
    ? PLANS[server.planTierId as PlanTierId]
    : null;
  const pending = ["queued", "running"].includes(server.operation?.status ?? "");
  const stopped = ["stopped", "paused", "suspended"].includes(server.state);
  const settled = !server.operation || server.operation.status === "succeeded";
  return (
    <section className="space-y-4 rounded-2xl bg-card p-5">
      <div className="flex items-center gap-3">
        {plan && (
          <PlanIcon
            planId={server.planTierId as PlanTierId}
            className="size-6 text-muted-foreground"
          />
        )}
        <div>
          <p className="text-xs text-muted-foreground">{copy.plan}</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {plan?.name ?? server.planTierId}
          </h2>
        </div>
      </div>
      {server.resources && <CapacitySummary resources={server.resources} />}
      <p className="text-sm text-muted-foreground">
        {copy.poolHint}
      </p>
      <Button asChild className="w-full">
        <Link href={workspaceBillingHref("/billing/plans", server.id)}>
          {server.planTierId === "free" ? t.billing.onboarding.choosePlan : copy.changePlan}
        </Link>
      </Button>
      {server.planTierId !== "free" && (
        <>
          {(!server.resources || stopped) && settled && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={actions.busy || pending}
              onClick={() => void actions.ensure()}
            >
              {stopped ? copy.resume : copy.provision}
            </Button>
          )}
          {server.resources && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={actions.busy || pending}
              onClick={() => void actions.previewResize()}
            >
              {copy.resize}
            </Button>
          )}
        </>
      )}
      <Link
        href={workspaceBillingHref("/billing/overview", server.id)}
        className="block text-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {t.dashboard.nav.billing}
      </Link>
    </section>
  );
}
