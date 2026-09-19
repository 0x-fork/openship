"use client";

import { useI18n, interpolate } from "@/components/i18n-provider";
import type { BillingState } from "@/lib/api/billing";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";

/** Lead with the limits customers use to plan a deployment. Detailed resource
 * measurements and their units live on Usage. */
export function BillingHeader({ state }: { state?: BillingState | null }) {
  const { t, locale } = useI18n();
  const copy = t.billing.resourcesGuide;
  const isFree = state?.tier === "free";
  const format = (n: number | null | undefined) => n === undefined ? "—" : n === null ? copy.unlimited : formatBillingNumber(n, locale);
  const meter = (used: number | null | undefined, max: number | null | undefined) => `${used == null ? "—" : format(used)} ${interpolate(t.billing.capacity.of, { max: format(max) })}`;
  const buildMax = state?.capacity?.buildMinutes?.max;
  const stats = state ? [
    { label: t.billing.overview.creditsLeft, value: formatMilliCredits(state.balance.quotaRemaining, locale),
      hint: isFree ? copy.noPlan : interpolate(t.billing.header.creditsSuffix, { limit: formatMilliCredits(state.balance.quotaLimit, locale) }), danger: !isFree && state.overQuota },
    { label: copy.buildTime, value: isFree ? copy.notIncluded : `${format(state.buildTimeMinutes)} ${t.billing.header.min}`,
      hint: isFree ? copy.noPlan : buildMax === null ? copy.unlimited : interpolate(t.billing.capacity.of, { max: `${format(buildMax)} ${t.billing.header.min}` }) },
    { label: copy.apps, value: isFree ? copy.notIncluded : meter(state.capacity?.services?.used, state.capacity?.services?.max),
      hint: isFree ? copy.noPlan : t.billing.capacity.title },
  ] : [];
  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight text-foreground/80">{t.billing.layout.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground/70">{t.billing.layout.subtitle}</p>
      {state && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => <div key={stat.label} className="rounded-xl border border-border/50 bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.danger ? "text-danger" : "text-foreground"}`}>{stat.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
        </div>)}
      </div>}
    </div>
  );
}
