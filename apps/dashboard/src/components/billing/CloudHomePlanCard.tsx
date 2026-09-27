"use client";

import Link from "next/link";
import { PLANS } from "@repo/core";
import { Icon } from "@repo/ui/icons";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { BillingState } from "@/lib/api/billing";
import { needsCloudPlan } from "@/lib/billing-presentation";

/** A compact entry point; plan selection and checkout stay in the billing flow. */
export function CloudHomePlanCard({ state }: { state: BillingState | null }) {
  const { t } = useI18n();
  const copy = t.billing.home;
  const needsPlan = state ? needsCloudPlan(state) : false;
  const hasPlan = state !== null && !needsPlan;
  const canSubscribe = needsPlan && state?.billing?.enabled === true;
  const statuses = t.billing.sidebar.statuses;
  const status =
    state && Object.hasOwn(statuses, state.status)
      ? statuses[state.status as keyof typeof statuses]
      : t.billing.sidebar.statusInactive;

  return (
    <section aria-label={copy.label} className="rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="cloud" className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{copy.label}</span>
        </div>
        {hasPlan && (
          <span
            className={`rounded-lg px-2 py-1 text-sm ${state.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
          >
            {status}
          </span>
        )}
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        {hasPlan
          ? (state.plan?.name ?? PLANS[state.tier].name)
          : canSubscribe
            ? copy.title
            : copy.plansAndBilling}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {hasPlan && state.complimentary
          ? t.billing.complimentary.label
          : canSubscribe
            ? copy.description
            : needsPlan
              ? copy.purchasesUnavailable
              : copy.manageDescription}
      </p>
      <Button asChild className="mt-4 h-9 w-full" variant={canSubscribe ? "default" : "secondary"}>
        <Link href={needsPlan ? "/billing/plans" : "/billing/overview"}>
          {needsPlan ? copy.viewPlans : t.billing.deployGate.manageBilling}
          <Icon name="arrow-right" className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

export function CloudHomePlanCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-2xl bg-card p-5 motion-safe:animate-pulse">
      <div className="flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-muted" />
        <div className="h-4 w-28 rounded bg-muted" />
      </div>
      <div className="mt-4 h-6 w-36 rounded bg-muted" />
      <div className="mt-2 h-10 rounded bg-muted" />
      <div className="mt-4 h-9 rounded-xl bg-muted" />
    </div>
  );
}
