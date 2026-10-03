"use client";

import { ServerBillingPicker, useBillingServerInventory } from "@/components/billing/ServerBillingPicker";
import { BillingLink } from "@/components/billing/BillingWorkspaceContext";
import { useI18n } from "@/components/i18n-provider";
import { Icon } from "@repo/ui/icons";

export function BillingContent({
  children,
  sidebar,
  layout = "details",
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode | null;
  layout?: "details" | "plans" | "purchase";
}) {
  const inventory = useBillingServerInventory();
  const { t } = useI18n();
  // Plans keep the whole comparison width. Usage and history retain the
  // visible server list; purchasing another server has no selected subscription.
  const showServers = Boolean(inventory && (inventory.error || inventory.servers.some(({ managed }) =>
    managed && (managed.resources || managed.planTierId !== "free" || managed.state !== "needs_plan"),
  )));
  if (layout !== "details") return <div className="min-w-0 space-y-5">
    {layout === "plans" && showServers && <ServerBillingPicker compact />}
    {layout === "purchase" && showServers && <BillingLink href="/billing" className="inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <Icon name="arrow-left" className="size-4 rtl:rotate-180" />{t.billing.creditAlert.backToBilling}
    </BillingLink>}
    {children}
  </div>;
  if (!sidebar && !showServers) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 min-w-0 lg:order-1">{children}</div>
      <aside className="order-1 min-w-0 space-y-4 lg:sticky lg:top-6 lg:order-2">
        {showServers && <ServerBillingPicker />}
        {sidebar}
      </aside>
    </div>
  );
}
