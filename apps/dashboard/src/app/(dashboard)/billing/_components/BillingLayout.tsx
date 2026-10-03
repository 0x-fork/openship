"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { usePlatform } from "@/context/PlatformContext";
import { BILLING_TABS } from "./billing-tabs";
import { BillingTabBar } from "./BillingTabBar";
import { BillingHeader } from "./BillingHeader";
import { BillingViewProvider, type BillingView } from "./BillingViewContext";

/** Persistent route chrome. Only the tab content suspends while its scoped state loads. */
export function BillingLayout({ children }: { children: React.ReactNode }) {
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
  const { selfHosted } = usePlatform();
  const inventory = useServerDestinations(!selfHosted);
  const [view, setView] = useState<BillingView | null>(null);
  const organizationMatches = !organizationId || organizationId === inventory.organizationId;
  const currentView =
    view?.contextKey === inventory.contextKey &&
    organizationMatches &&
    Boolean(view.newServer) === newServer
      ? view
      : null;
  const workspaceId = newServer
    ? undefined
    : (requestedWorkspaceId ??
      (currentView?.requestedWorkspaceId === requestedWorkspaceId
        ? currentView?.workspaceId
        : undefined));
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
  const activeTab = currentView?.plansOnly
    ? "plans"
    : (BILLING_TABS.find((tab) => tab.key === segment)?.key ?? "overview");
  const serverInventory =
    !selfHosted && organizationMatches
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
            <BillingHeader>
              {activeTab === "plans" &&
                (newServer ? (
                  billingServersVisible(serverInventory) && (
                    <Button asChild variant="secondary" className="shrink-0">
                      <BillingLink href="/billing">
                        <Icon name="arrow-left" className="size-4 rtl:rotate-180" />
                        {t.billing.creditAlert.backToBilling}
                      </BillingLink>
                    </Button>
                  )
                ) : (
                  <ServerBillingPicker compact />
                ))}
            </BillingHeader>
            <BillingTabBar
              activeTab={activeTab}
              plansOnly={newServer || currentView?.plansOnly}
              newServer={newServer}
              loading={!currentView}
            />
            {children}
          </BillingServerInventoryProvider>
        </BillingViewProvider>
      </BillingWorkspaceProvider>
    </PageContainer>
  );
}
