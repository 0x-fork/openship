"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { BillingWorkspaceProvider } from "@/components/billing/BillingWorkspaceContext";
import { BILLING_TABS } from "./billing-tabs";
import { BillingTabBar } from "./BillingTabBar";
import { BillingHeader } from "./BillingHeader";

/** Persistent route chrome. Only the tab content suspends while its scoped state loads. */
export function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId") || undefined;
  const organizationId = searchParams.get("organizationId") || undefined;
  const segment = pathname.split("/").at(-1);
  const activeTab = BILLING_TABS.find((tab) => tab.key === segment)?.key ?? "overview";

  return (
    <PageContainer className="space-y-6">
      <BillingWorkspaceProvider workspaceId={workspaceId} organizationId={organizationId}>
        <BillingHeader workspaceId={workspaceId} />
        <BillingTabBar activeTab={activeTab} />
        {children}
      </BillingWorkspaceProvider>
    </PageContainer>
  );
}
