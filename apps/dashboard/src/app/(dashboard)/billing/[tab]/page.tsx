import { notFound } from "next/navigation";
import type { PlanTierId } from "@repo/core";
import { BillingOverview } from "@/components/billing/BillingOverview";
import { BillingUsage } from "@/components/billing/BillingUsage";
import { BillingTopups } from "@/components/billing/BillingTopups";
import { BillingPlansRoute } from "../_components/BillingPlansRoute";
import { BillingCheckoutStatus } from "../_components/BillingCheckoutStatus";
import { BillingSidebar, InvoicesPanel, PaymentMethodPanel } from "../_components/billing-shared";
import { BILLING_TABS } from "../_components/billing-tabs";
import { BillingUnavailable } from "../_components/BillingUnavailable";
import { getBillingPageState } from "../_components/billing-state";
import { isNewCloudCustomer } from "@/lib/billing-presentation";
import { BillingContent } from "../_components/BillingContent";
import { BillingWorkspaceProvider } from "@/components/billing/BillingWorkspaceContext";

export default async function BillingTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await params;
  const query = await searchParams;

  const activeTab = BILLING_TABS.find((item) => item.key === tab)?.key;
  if (!activeTab) {
    notFound();
  }

  const workspaceId = typeof query.workspaceId === "string" ? query.workspaceId : undefined;
  const result = await getBillingPageState(workspaceId);

  if (result.kind === "unavailable") {
    return <BillingUnavailable reason={result.reason} />;
  }

  const state = result.state;

  function renderTab() {
    switch (tab) {
      case "overview":
        return <BillingOverview state={state} />;
      case "usage":
        return <BillingUsage state={state} />;
      case "plans":
        return (
          <BillingPlansRoute
            currentPlan={state.tier as PlanTierId}
            subscription={state.subscription}
            complimentary={state.complimentary}
            billingEnabled={state.billing?.enabled === true}
            canChangeSubscription={state.capabilities?.subscriptionChange === true}
          />
        );
      case "topups":
        return <BillingTopups state={state} />;
      case "payment":
        return (
          <PaymentMethodPanel
            portalAvailable={state.capabilities?.portal === true}
            hasHistory={!isNewCloudCustomer(state)}
          />
        );
      case "invoices":
        return (
          <InvoicesPanel
            portalAvailable={state.capabilities?.portal === true}
            hasHistory={!isNewCloudCustomer(state)}
          />
        );
      default:
        notFound();
    }
  }

  return (
    <BillingWorkspaceProvider workspaceId={state.workspace?.id}>
      <BillingContent
        sidebar={
          activeTab === "plans" ? null : (
            <BillingSidebar state={state} showSubscriptionControls={activeTab === "overview"} />
          )
        }
      >
        {(query.checkout === "success" || query.topup === "success") && (
          <BillingCheckoutStatus
            kind={query.topup === "success" ? "topup" : "subscription"}
            checkoutId={typeof query.session_id === "string" ? query.session_id : undefined}
            expectedTier={typeof query.tier === "string" ? query.tier : undefined}
            expectedInterval={
              query.interval === "monthly" || query.interval === "annual"
                ? query.interval
                : undefined
            }
          />
        )}
        {renderTab()}
      </BillingContent>
    </BillingWorkspaceProvider>
  );
}
