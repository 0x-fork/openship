"use client";

import { Button } from "@/components/ui/button";
import { BillingPlansSkeleton } from "@/app/(dashboard)/billing/_components/BillingTabSkeleton";

import { useEffect, useState, type ReactNode } from "react";
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
import { SubscriptionChangeStatus } from "./SubscriptionChangeStatus";
import { serverPlanChoices } from "./plan-presentation";
import {
  CloudPurchaseHeaderContent,
  CloudPurchaseScope,
  CloudPurchaseTabs,
  useCloudPurchase,
} from "./CloudPurchaseContext";
import { PayAsYouGoPlan } from "./PayAsYouGoPlan";

export function CloudPlanPicker(props: Parameters<typeof PlanPicker>[0]) {
  return (
    <CloudPurchaseScope>
      <PlanPicker {...props} />
    </CloudPurchaseScope>
  );
}

function PlanPicker({
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
  prepareWorkspace,
  purchaseDetails,
  purchaseDisabled = false,
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
  onCheckoutStarted?: (checkoutUrl?: string) => void;
  /** New server acquisition resolves its identity only after choosing a plan. */
  prepareWorkspace?: () => Promise<string>;
  purchaseDetails?: ReactNode;
  purchaseDisabled?: boolean;
}) {
  const { t } = useI18n();
  const purchase = useCloudPurchase();
  const billingWorkspaceId = useBillingWorkspace();
  const selectedWorkspaceId = workspaceId ?? billingWorkspaceId;
  const changes = useSubscriptionChange(selectedWorkspaceId, onCheckoutStarted);
  const workspaceScoped =
    Boolean(workspaceId ?? billingWorkspaceId) ||
    (currentPlan === "free" && !subscription && !complimentary);
  const { payload, loading, error, retry } = useCloudPlans();
  const [purchaseInterval, setInterval] = useState<"monthly" | "annual">("monthly");
  const interval =
    subscription && subscription.status !== "canceled" ? subscription.interval : purchaseInterval;
  const hasPlan = !needsCloudPlan({ tier: currentPlan, subscription, complimentary });
  const canChooseMode = !hasPlan && purchase.tabs !== "none";
  const payg = canChooseMode && purchase.mode === "payg";
  const choices = serverPlanChoices({
    plans: payload?.plans ?? [],
    currentOffer: hasPlan ? currentOffer : null,
    interval,
    allocatedDiskGb,
  });
  const compareUpgrades = hasPlan && Boolean(currentOffer);
  const canUseCustom = Boolean(
    payload?.custom && !(hasPlan && subscription?.interval === "annual"),
  );
  const defaultConfiguration =
    canUseCustom &&
    (subscription?.configuration === "custom" ||
      (compareUpgrades ? choices.upgrades.length === 0 : choices.available.length === 0))
      ? "custom"
      : "plans";
  const choiceKey = `${selectedWorkspaceId ?? "new"}:${subscription?.offerReference ?? currentPlan}:${interval}`;
  const [choice, setChoice] = useState<{
    key: string;
    configuration: "plans" | "custom";
    other: boolean;
  } | null>(null);
  const selected = choice?.key === choiceKey ? choice : null;
  const configuration = selected?.configuration ?? defaultConfiguration;
  const showOtherPlans = selected?.other ?? false;
  const selectConfiguration = (configuration: "plans" | "custom", other = showOtherPlans) =>
    setChoice({ key: choiceKey, configuration, other });
  const visiblePlans = compareUpgrades && !showOtherPlans ? choices.upgrades : choices.available;
  const canPurchase =
    !complimentary &&
    billingEnabled &&
    needsCloudPlan({ tier: currentPlan, subscription, complimentary }) &&
    (currentPlan === "free" || canChangeSubscription);
  const canModify = Boolean(
    selectedWorkspaceId &&
    !complimentary &&
    billingEnabled &&
    canChangeSubscription &&
    subscription?.status === "active" &&
    !subscription.cancelAtPeriodEnd &&
    !subscription.pendingChange,
  );
  const selectable = canPurchase || canModify;
  const {
    startCheckout,
    subscribing,
    error: checkoutError,
    checkoutUrl,
    quoteRevision,
  } = useCloudCheckout({
    enabled: canPurchase && !purchaseDisabled && !payg,
    preserveProject,
    onCheckoutStarted,
    workspaceId,
    prepareWorkspace,
  });
  const selectedCurrentPlan =
    hasPlan && subscription?.configuration !== "custom" ? choices.current : null;
  const busy = subscribing !== null || changes.busy;
  const setPurchaseBusy = purchase.setBusy;
  useEffect(() => {
    setPurchaseBusy(canChooseMode && (busy || Boolean(checkoutUrl)));
    return () => setPurchaseBusy(false);
  }, [busy, checkoutUrl, canChooseMode, setPurchaseBusy]);

  const handleSelectPlan = (planTierId: PlanTierId) => {
    if (selectable && planTierId !== selectedCurrentPlan)
      void (canModify ? changes.review(planTierId) : startCheckout(planTierId, interval));
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

  const copy = t.billing.plansRoute;
  const contactPlans = payload.plans.filter((plan) => plan.price.monthly === null && plan.contactSales);
  const title = hasPlan
    ? showOtherPlans
      ? copy.otherPlans
      : copy.upgradeServer
    : purchase.intro.title;
  const description = hasPlan
    ? showOtherPlans
      ? copy.otherPlansHint
      : copy.upgradeHint
    : purchase.intro.description;
  const showIntroduction = !preserveProject && !(canChooseMode && purchase.tabs === "header");

  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {compareUpgrades && (choices.other.length > 0 || showOtherPlans) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            selectConfiguration(showOtherPlans ? defaultConfiguration : "plans", !showOtherPlans)
          }
        >
          {showOtherPlans ? copy.backToUpgrades : copy.otherPlans}
        </Button>
      )}
      {payload.custom && visiblePlans.length > 0 && (
        <div
          role="group"
          aria-label={t.billing.custom.configuration}
          className="inline-flex gap-1 rounded-xl bg-muted/40 p-1"
        >
          {(["plans", "custom"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={configuration === value ? "secondary" : "ghost"}
              aria-pressed={configuration === value}
              disabled={busy || (value === "custom" && !canUseCustom)}
              onClick={() => selectConfiguration(value)}
            >
              {value === "plans"
                ? compareUpgrades && !showOtherPlans
                  ? t.billing.pricing.upgrade
                  : t.billing.custom.presets
                : t.billing.custom.name}
            </Button>
          ))}
        </div>
      )}
      {configuration === "plans" &&
        payload.annual.enabled &&
        (!subscription || subscription.status === "canceled") && (
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
  );
  const details =
    showIntroduction || purchaseDetails || !canChooseMode ? (
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        {showIntroduction && (
          <div className="min-w-0 flex-1 basis-96">
            <h2 className="text-base font-medium text-foreground">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
        )}
        {purchaseDetails}
        {!canChooseMode && controls}
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      {canChooseMode && purchase.tabs === "inline" && <CloudPurchaseTabs />}
      {canChooseMode ? (
        <CloudPurchaseHeaderContent details={details} controls={controls} />
      ) : (
        details
      )}
      <div
        hidden={payg}
        role={canChooseMode ? "tabpanel" : undefined}
        id={canChooseMode ? `${purchase.id}-panel-monthly` : undefined}
        aria-labelledby={canChooseMode ? `${purchase.id}-tab-monthly` : undefined}
        className="space-y-5"
      >
        {subscription?.pendingChange && (
          <SubscriptionChangeStatus
            key={`${selectedWorkspaceId}:${subscription.pendingChange.id}`}
            initial={subscription.pendingChange}
            workspaceId={selectedWorkspaceId}
          />
        )}
        {checkoutUrl && <CloudCheckoutNotice checkoutUrl={checkoutUrl} />}
        {checkoutError && (
          <p role="alert" className="text-sm text-danger">
            {checkoutError}
          </p>
        )}
        {changes.error && !changes.open && (
          <p role="alert" className="text-sm text-danger">
            {changes.error}
          </p>
        )}
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
            key={`${selectedWorkspaceId}:${currentOffer?.offerReference ?? currentPlan}`}
            catalog={payload.custom}
            plans={payload.plans}
            ui={payload.ui}
            currentOffer={currentOffer}
            subscription={subscription}
            allocatedDiskGb={allocatedDiskGb}
            disabled={!selectable || purchaseDisabled || payg}
            busy={busy}
            actionLabel={canModify ? t.billing.planChange.review : undefined}
            quoteRevision={quoteRevision}
            onSelect={(quote) => {
              const custom = { resources: quote.resources, quoteReference: quote.reference };
              void (canModify
                ? changes.review(quote.basePlanTierId, custom)
                : startCheckout(quote.basePlanTierId, "monthly", custom));
            }}
          />
        ) : visiblePlans.length > 0 ? (
          <PricingCards
            plans={visiblePlans}
            ui={payload.ui}
            currentPlan={selectedCurrentPlan}
            onSelectPlan={handleSelectPlan}
            subscribingPlan={subscribing}
            purchasesDisabled={!selectable || changes.busy || purchaseDisabled || payg}
            selectionLabel={canModify ? t.billing.planChange.review : undefined}
            interval={interval}
            workspaceScoped={workspaceScoped}
          />
        ) : (
          <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">
            {copy.noLargerPlan}
          </p>
        )}
        {contactPlans.length > 0 && (
          <PricingCards plans={contactPlans} ui={payload.ui} currentPlan={currentPlan} />
        )}
      </div>
      {canChooseMode && (
        <div
          hidden={!payg}
          role="tabpanel"
          id={`${purchase.id}-panel-payg`}
          aria-labelledby={`${purchase.id}-tab-payg`}
        >
          <PayAsYouGoPlan pricing={payload.computePricing} catalog={payload.custom} payg={payload.payg} />
        </div>
      )}
      <SubscriptionChangeDialog actions={changes} workspaceId={selectedWorkspaceId} />
    </div>
  );
}

/** Keep the checkout link available when a destination dialog hands off to status. */
export function CloudCheckoutNotice({ checkoutUrl }: { checkoutUrl: string }) {
  const { t } = useI18n();
  return (
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
  );
}
