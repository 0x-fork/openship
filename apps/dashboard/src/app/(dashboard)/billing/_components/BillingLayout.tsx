"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  BillingLink,
  BillingWorkspaceProvider,
} from "@/components/billing/BillingWorkspaceContext";
import {
  BillingServerInventoryProvider,
  ServerBillingPicker,
  billingServersVisible,
} from "@/components/billing/ServerBillingPicker";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@repo/ui/icons";
import { useServerDestinations } from "@/hooks/useServerDestinations";
import { CloudPurchaseProvider } from "@/components/billing/CloudPurchaseContext";
import { newServerBillingHref } from "@/lib/billing-links";
import { BILLING_TABS } from "./billing-tabs";
import { BillingTabBar } from "./BillingTabBar";
import { BillingHeader } from "./BillingHeader";
import { BillingViewProvider, type BillingView } from "./BillingViewContext";
import { PendingPaymentsButton } from "@/components/billing/CheckoutRecovery";

/** Persistent route chrome. Only the tab content suspends while its scoped state loads. */
function BillingProducts() {
  const pathname = usePathname();
  const router = useRouter();
  return <Tabs variant="pills" ariaLabel="Hosting options" value={pathname.endsWith("/manage") ? "manage" : "cloud"}
    tabs={[{ key: "cloud", label: "Openship Cloud", icon: "cloud", href: "/billing/overview" }, { key: "manage", label: "Your infrastructure", icon: "server", href: "/billing/manage" }]}
    onChange={value => router.push(value === "manage" ? "/billing/manage" : "/billing/overview")} />;
}
export function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.endsWith("/manage")) return <PageContainer className="space-y-6"><BillingHeader /><BillingProducts />{children}</PageContainer>;
  return <CloudBillingLayout>{children}</CloudBillingLayout>;
}
function CloudBillingLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId") || undefined;
  const organizationId = searchParams.get("organizationId") || undefined;
  const segment = pathname.split("/").at(-1);
  const newServer =
    segment === "plans" &&
    searchParams.get("newServer") === "1" &&
    !["checkout", "topup", "session_id"].some((key) => searchParams.has(key));
  const inventory = useServerDestinations();
  const [view, setView] = useState<BillingView | null>(null);
  const organizationMatches = !organizationId || organizationId === inventory.organizationId;
  const currentView =
    view?.contextKey === inventory.contextKey &&
    organizationMatches &&
    Boolean(view.newServer) === newServer
      ? view
      : null;
  // Keep navigation mounted during a server switch, without reusing the
  // previous server's purchase mode or billing scope while the next one loads.
  const scopedView =
    currentView?.requestedWorkspaceId === requestedWorkspaceId ? currentView : null;
  const workspaceId = newServer ? undefined : (requestedWorkspaceId ?? scopedView?.workspaceId);
  const reportView = useCallback(
    (next: BillingView) => {
      // A tab from an earlier account, organization or server cannot update the
      // current navigation while its replacement is still loading.
      if (
        next.contextKey === inventory.contextKey &&
        next.organizationId === organizationId &&
        next.requestedWorkspaceId === requestedWorkspaceId &&
        Boolean(next.newServer) === newServer
      )
        setView(next);
    },
    [inventory.contextKey, organizationId, requestedWorkspaceId, newServer],
  );

  const servers = inventory.data?.servers.filter((server) => server.managed) ?? [];
  const plansOnly = newServer || Boolean(scopedView?.plansOnly);
  const activeTab = plansOnly
    ? "plans"
    : segment === "invoices"
      ? "payment"
      : (BILLING_TABS.find((tab) => tab.key === segment)?.key ?? "overview");
  const serverInventory =
    organizationMatches
      ? {
          servers,
          loading: inventory.loading,
          error: inventory.error,
          onRetry: inventory.refresh,
        }
      : null;

  return (
    <PageContainer className="space-y-6">
      <BillingWorkspaceProvider workspaceId={workspaceId} organizationId={organizationId}>
        <BillingViewProvider value={reportView}>
          <BillingServerInventoryProvider value={serverInventory}>
            <CloudPurchaseProvider
              scopeKey={`${inventory.resourceKey}:${organizationId ?? ""}:${newServer ? "new" : (workspaceId ?? "unsubscribed")}`}
              tabs={plansOnly ? "header" : "none"}
            >
              <BillingHeader>
                {organizationMatches && (servers.length > 0 || Boolean(workspaceId)) &&
                  <PendingPaymentsButton />}
                {billingServersVisible(serverInventory) &&
                  (newServer ? (
                    <Button asChild variant="secondary" className="shrink-0">
                      <BillingLink href="/billing">
                        <Icon name="arrow-left" className="size-4 rtl:rotate-180" />
                        {t.billing.creditAlert.backToBilling}
                      </BillingLink>
                    </Button>
                  ) : (
                    <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
                      {activeTab === "plans" && <ServerBillingPicker compact />}
                      <Button asChild variant="secondary" className="shrink-0">
                        <BillingLink href={newServerBillingHref()}>
                          <Icon name="plus" className="size-4" aria-hidden="true" />
                          {t.billing.layout.getServer}
                        </BillingLink>
                      </Button>
                    </div>
                  ))}
              </BillingHeader>
              <BillingProducts />
              <BillingTabBar
                activeTab={activeTab}
                plansOnly={plansOnly}
                topupsAvailable={scopedView?.topupsAvailable}
                loading={!currentView}
              />
              {children}
            </CloudPurchaseProvider>
          </BillingServerInventoryProvider>
        </BillingViewProvider>
      </BillingWorkspaceProvider>
    </PageContainer>
  );
}
