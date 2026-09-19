"use client";

import { RESOURCE_TIER_SPECS, formatCpuCores, formatMemoryMb } from "@repo/core";
import { useI18n, interpolate } from "@/components/i18n-provider";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";
import type { ApiPlan } from "./PricingCards";

/** Compare the live plan's credits and enforced limits using consistent units. */
export function PlanResources({ plan, interval = "monthly" }: { plan: ApiPlan; interval?: "monthly" | "annual" }) {
  const { t, locale } = useI18n();
  const copy = t.billing.resourcesGuide;
  if (plan.id === "free") return <p className="text-xs leading-relaxed text-muted-foreground">{copy.setupHint}</p>;
  const count = (n: number | null) => n === null ? copy.unlimited : formatBillingNumber(n, locale);
  const spec = plan.limits.maxResourceTier ? RESOURCE_TIER_SPECS[plan.limits.maxResourceTier] : null;
  const credits = interval === "annual" ? plan.annualCredits : plan.monthlyCredits;
  const facts = [
    { label: copy.credits, value: credits == null ? plan.id === "enterprise" ? t.billing.pricing.custom : "—" : interpolate(copy.creditsPerCycle, { amount: formatMilliCredits(credits, locale) }) },
    { label: copy.buildTime, value: plan.limits.buildMinutesPerMonth === null ? copy.unlimited : interpolate(copy.buildMinutes, { amount: count(plan.limits.buildMinutesPerMonth) }) },
    { label: copy.apps, value: count(plan.limits.runningServices) },
    { label: copy.machine, value: spec ? `${formatCpuCores(spec.cpuCores)} · ${formatMemoryMb(spec.memoryMb)}` : copy.unlimited },
    { label: copy.projects, value: count(plan.limits.maxProjects) },
  ];
  return (
    <dl className="space-y-3 border-t border-border/40 py-4">
      {facts.map(({ label, value }) => <div key={label}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{value}</dd>
      </div>)}
    </dl>
  );
}
