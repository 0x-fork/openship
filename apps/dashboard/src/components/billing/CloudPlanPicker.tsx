"use client";

import { Button } from "@/components/ui/button";
import { BillingPlansSkeleton } from "@/app/(dashboard)/billing/_components/BillingTabSkeleton";

import { useEffect, useState } from "react";
import { PricingCards } from "@/components/billing/PricingCards";
import type { PlanTierId } from "@repo/core";
import { useI18n } from "@/components/i18n-provider";
import type { BillingSubscription } from "@repo/contracts";
import type { BillingState } from "@/lib/api/billing";
import { needsCloudPlan } from "@/lib/billing-presentation";
import { useCloudCheckout, useCloudPlans } from "./useCloudBilling";
import { useBillingWorkspace } from "./BillingWorkspaceContext";
import { CustomPlanConfigurator } from "./CustomPlanConfigurator";
import type { ApiPlan } from "./PricingCards";
import { useSubscriptionChange } from "./useSubscriptionChange";
import { SubscriptionChangeDialog } from "./SubscriptionChangeDialog";

export function CloudPlanPicker({
  currentPlan,
  subscription,
  complimentary,
  billingEnabled = false,
  canChangeSubscription = false,
  preserveProject = false,
  onCheckoutStarted,
  workspaceId,
  currentOffer,
  allocatedDiskGb,
}: {
  workspaceId?: string;
  currentPlan: PlanTierId;
  currentOffer?: ApiPlan | null;
  allocatedDiskGb?: number | null;
  billingEnabled?: boolean;
  canChangeSubscription?: boolean;
  subscription?: BillingSubscription | null;
  complimentary?: BillingState["complimentary"];
  preserveProject?: boolean;
  onCheckoutStarted?: () => void;
}) {
  const { t } = useI18n();
  const billingWorkspaceId = useBillingWorkspace();
  const selectedWorkspaceId = workspaceId ?? billingWorkspaceId;
  const changes = useSubscriptionChange(selectedWorkspaceId, onCheckoutStarted);
  const workspaceScoped = Boolean(workspaceId ?? billingWorkspaceId) ||
    (currentPlan === "free" && !subscription && !complimentary);
  const { payload, loading, error, retry } = useCloudPlans();
  const [purchaseInterval, setInterval] = useState<"monthly" | "annual">("monthly");
  const interval = subscription && subscription.status !== "canceled" ? subscription.interval : purchaseInterval;
  const [configuration, setConfiguration] = useState<"plans" | "custom">(
    subscription?.configuration === "custom" ? "custom" : "plans",
  );
  useEffect(() => {
    setConfiguration(subscription?.configuration === "custom" ? "custom" : "plans");
  }, [selectedWorkspaceId, subscription?.configuration]);
  const canPurchase =
    !complimentary && billingEnabled && needsCloudPlan({ tier: currentPlan, subscription, complimentary })
      && (currentPlan === "free" || canChangeSubscription);
  const canModify = Boolean(selectedWorkspaceId && !complimentary && billingEnabled && canChangeSubscription &&
    subscription?.status === "active" && !subscription.cancelAtPeriodEnd && !subscription.pendingChange);
  const selectable = canPurchase || canModify;
  const {
    startCheckout,
    subscribing,
    error: checkoutError,
    checkoutUrl,
    quoteRevision,
  } = useCloudCheckout({
    enabled: canPurchase,
    preserveProject,
    onCheckoutStarted,
    workspaceId,
  });
  const selectedCurrentPlan =
    subscription?.configuration === "custom" ||
    needsCloudPlan({ tier: currentPlan, subscription, complimentary }) ||
    (!complimentary && subscription && subscription.interval !== interval)
      ? null
      : currentPlan;

  const handleSelectPlan = (planTierId: PlanTierId) => {
    if (planTierId !== selectedCurrentPlan) void (canModify ? changes.review(planTierId) : startCheckout(planTierId, interval));
  };

  if (loading) return <BillingPlansSkeleton />;

  if (error || !payload) {
    return (
      <div className="rounded-2xl bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {error || t.billing.plansRoute.genericError}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={retry} className="mt-3">
          {t.billing.plansRoute.tryAgain}
        </Button>
      </div>
    );
  }

  // The Plans tab is where you BUY something, so the $0 tier has no place in it:
  // it is nothing to buy, and for the overwhelming majority of viewers it is the
  // plan they are already on — a card whose only button says "Current plan".
  // Where you stand is stated on Overview and in the allowance cards above.
  // Filtered on price rather than the id `free` so any future $0 tier is covered
  // by the same rule. Customers can stop renewal from Overview or the portal.
  const purchasable = payload.plans.filter((p) => p.price.monthly !== 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!preserveProject && (
          <div>
            <h2 className="text-base font-medium text-foreground">
              {subscription && subscription.status !== "canceled" ? t.billing.workspaces.changePlan : t.billing.onboarding.compareTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription && subscription.status !== "canceled" ? t.billing.plansRoute.currentServerPlans
                : workspaceScoped ? t.billing.workspaces.description : t.billing.onboarding.compareDescription}
            </p>
          </div>
        )}
        {payload.custom && (
          <div role="group" aria-label={t.billing.custom.configuration} className="inline-flex gap-1 rounded-xl bg-muted/40 p-1">
            {(["plans", "custom"] as const).map(value => (
              <Button
                key={value} type="button" size="sm" variant={configuration === value ? "secondary" : "ghost"}
                aria-pressed={configuration === value} disabled={subscribing !== null || changes.busy || (value === "custom" && subscription?.interval === "annual")}
                onClick={() => setConfiguration(value)}
              >
                {value === "plans" ? t.billing.custom.presets : t.billing.custom.name}
              </Button>
            ))}
          </div>
        )}
        {configuration === "plans" && payload.annual.enabled && (!subscription || subscription.status === "canceled") && (
          <div
            className="inline-flex gap-1 rounded-xl bg-muted/40 p-1"
            role="group"
            aria-label={t.billing.pricing.billingInterval}
          >
            {(["monthly", "annual"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                disabled={subscribing !== null}
                variant={interval === value ? "secondary" : "ghost"}
              >
                {value === "monthly" ? t.billing.pricing.monthly : t.billing.pricing.annual}
              </Button>
            ))}
          </div>
        )}
      </div>
      {checkoutUrl && (
        <div role="status" className="rounded-xl bg-muted/40 p-3 text-sm">
          <p>{t.billing.deployGate.checkoutOpened}</p>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex font-medium text-primary hover:underline"
          >
            {t.billing.deployGate.continueCheckout}
          </a>
        </div>
      )}
      {checkoutError && (
        <p role="alert" className="text-sm text-danger">
          {checkoutError}
        </p>
      )}
      {changes.error && !changes.open && <p role="alert" className="text-sm text-danger">{changes.error}</p>}
      {!selectable && !subscription?.pendingChange && (
        <p className="text-sm text-muted-foreground">
          {complimentary
            ? t.billing.complimentary.changeViaSupport
            : billingEnabled
              ? t.billing.plansRoute.changeViaSupport
              : t.billing.plansRoute.billingUnavailable}{" "}
          <a href="mailto:support@openship.io" className="text-primary hover:underline">
            {t.billing.portal.supportButton}
          </a>
        </p>
      )}
      {configuration === "custom" && payload.custom ? (
        <CustomPlanConfigurator
          catalog={payload.custom} plans={purchasable} ui={payload.ui}
          currentOffer={currentOffer} subscription={subscription}
          allocatedDiskGb={allocatedDiskGb}
          disabled={!selectable} busy={subscribing !== null || changes.busy}
          actionLabel={canModify ? t.billing.planChange.review : undefined}
          quoteRevision={quoteRevision}
          onSelect={quote => {
            const custom = { resources: quote.resources, quoteReference: quote.reference };
            void (canModify ? changes.review(quote.basePlanTierId, custom) : startCheckout(quote.basePlanTierId, "monthly", custom));
          }}
        />
      ) : (
        <PricingCards
          plans={purchasable}
          ui={payload.ui}
          currentPlan={selectedCurrentPlan}
          onSelectPlan={handleSelectPlan}
          subscribingPlan={subscribing}
          purchasesDisabled={!selectable || changes.busy}
          selectionLabel={canModify ? t.billing.planChange.review : undefined}
          interval={interval}
          workspaceScoped={workspaceScoped}
        />
      )}
      <SubscriptionChangeDialog actions={changes} workspaceId={selectedWorkspaceId} />
    </div>
  );
}
