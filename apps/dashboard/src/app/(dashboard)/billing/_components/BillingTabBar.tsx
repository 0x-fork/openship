"use client";

import { Icon as UiIcon } from "@repo/ui/icons";

import { BillingLink as Link } from "@/components/billing/BillingWorkspaceContext";
import { useI18n } from "@/components/i18n-provider";
import { BILLING_TABS, type BillingTab } from "./billing-tabs";

export function BillingTabBar({ activeTab }: { activeTab: BillingTab }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t.billing.layout.title}
      className="flex items-center gap-1 overflow-x-auto border-b border-border/50"
    >
      {BILLING_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4 ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            <UiIcon name={Icon} className="size-4" />
            {t.billing.tabs[tab.key]}
            {active && (
              <span className="absolute bottom-0 start-0 end-0 h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
