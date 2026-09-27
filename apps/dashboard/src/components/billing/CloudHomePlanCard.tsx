"use client";

import Link from "next/link";
import { Icon } from "@repo/ui/icons";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { BillingState } from "@/lib/api/billing";
import { isNewCloudCustomer } from "@/lib/billing-presentation";
import { CloudPlanIllustration } from "./CloudPlanIllustration";

/** First-subscription offer; existing customers manage their plan in Billing. */
export function CloudHomePlanCard({ state }: { state: BillingState | null }) {
  const { t } = useI18n();
  const copy = t.billing.home;

  if (!state || !isNewCloudCustomer(state) || state.complimentary || state.billing?.enabled !== true) {
    return null;
  }

  return (
    <section aria-label={copy.label} className="overflow-hidden rounded-2xl bg-card p-5">
      <p className="text-sm font-medium text-foreground/80">{copy.label}</p>
      <CloudPlanIllustration className="mx-auto my-1 w-52" />
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {copy.title}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {copy.description}
      </p>
      <Button asChild className="mt-5 h-10 w-full">
        <Link href="/billing/plans">
          {copy.viewPlans}
          <Icon name="arrow-right" className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
