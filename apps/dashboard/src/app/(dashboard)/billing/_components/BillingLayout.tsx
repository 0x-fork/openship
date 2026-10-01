import { PageContainer } from "@/components/ui/PageContainer";
import type { BillingState } from "@/lib/api/billing";
import { BillingWorkspaceProvider } from "@/components/billing/BillingWorkspaceContext";
import { WorkspaceBillingPicker } from "@/components/cloud-workspaces/WorkspaceBillingPicker";
import { BillingSidebar } from "./billing-shared";
import { BillingTabBar } from "./BillingTabBar";
import { BillingContent } from "./BillingContent";
import { BillingHeader } from "./BillingHeader";
import { needsCloudPlan } from "@/lib/billing-presentation";

export function BillingLayout({
  children,
  state,
  workspaceId,
}: {
  children: React.ReactNode;
  state: BillingState | null;
  workspaceId?: string;
}) {
  // No billing state — cloud not connected, billing not enabled, or the fetch
  // errored. Don't render the header + tab-bar chrome (and its formatters) above
  // an "unavailable" screen: the tab page renders <BillingUnavailable> with the
  // precise reason. This also keeps billing effectively cloud-gated when reached
  // by direct URL / RSC prefetch (the sidebar link is already hidden).
  if (!state) {
    return (
      <PageContainer className="space-y-6">
        <BillingHeader />
        <WorkspaceBillingPicker workspaceId={workspaceId} />
        {children}
      </PageContainer>
    );
  }

  return (
    <BillingWorkspaceProvider workspaceId={state.workspace?.id}>
      <PageContainer className="space-y-6">
        <BillingHeader />
        <WorkspaceBillingPicker workspaceId={state.workspace?.id} />

        <BillingTabBar />

        <BillingContent
          sidebar={<BillingSidebar state={state} />}
          promotePlan={needsCloudPlan(state)}
        >
          {children}
        </BillingContent>
      </PageContainer>
    </BillingWorkspaceProvider>
  );
}
