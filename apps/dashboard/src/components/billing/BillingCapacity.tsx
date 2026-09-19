"use client";

import { CircleHelp, Clock3, Cloud, Layers3 } from "lucide-react";
import { PLANS, RESOURCE_TIER_SPECS, formatCpuCores, formatMemoryMb } from "@repo/core";
import { useI18n, interpolate } from "@/components/i18n-provider";
import type { BillingState, CapacityMeter } from "@/lib/api/billing";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";
import { hasUnlimitedCloudCredits } from "@/lib/billing-presentation";

export type { BillingState };

interface RowSpec {
  key: string;
  label: string;
  hint: string;
  meter: CapacityMeter;
  format: (n: number) => string;
  unit?: string;
  unlimited?: boolean;
}

/** Keep explanations available to touch and keyboard users without a wall of copy. */
function MetricLabel({ label, hint }: { label: string; hint: string }) {
  return <details className="group relative" onKeyDown={(event) => {
    if (event.key === "Escape") event.currentTarget.open = false;
  }}>
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      {label}<CircleHelp className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
    </summary>
    <p className="absolute start-0 top-full z-10 mt-2 w-64 max-w-[calc(100vw-5rem)] rounded-xl border border-border/50 bg-popover/95 p-3 text-xs leading-relaxed text-muted-foreground shadow-lg backdrop-blur-xl">{hint}</p>
  </details>;
}

function MeterRow({ label, hint, meter, format, unit, unlimited = false }: Omit<RowSpec, "key">) {
  const { t } = useI18n();
  const c = t.billing.capacity;
  const suffix = unit ? ` ${unit}` : "";
  const hasMax = meter.max != null;
  const hasUsed = meter.used != null;
  const progress = hasMax && hasUsed && meter.max! > 0 ? Math.min(100, Math.max(0, meter.used! / meter.max! * 100)) : 0;
  const tone = progress >= 90 ? "bg-danger" : progress >= 75 ? "bg-warning" : "bg-primary";
  const used = hasUsed ? `${format(meter.used!)}${suffix}` : "—";
  const limit = hasMax ? interpolate(c.of, { max: `${format(meter.max!)}${suffix}` }) : unlimited ? `· ${c.unlimited}` : "";

  return <div className="py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
      <MetricLabel label={label} hint={hint} />
      <span className="text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{used}</span>{limit && <> {limit}</>}
      </span>
    </div>
    {hasMax && meter.max! > 0 && <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
      role={hasUsed ? "progressbar" : undefined} aria-label={label}
      aria-valuemin={hasUsed ? 0 : undefined} aria-valuemax={hasUsed ? meter.max! : undefined}
      aria-valuenow={hasUsed ? Math.min(meter.max!, Math.max(0, meter.used!)) : undefined}
      aria-valuetext={hasUsed ? `${used} ${limit}` : undefined}>
      {hasUsed && <div className={`${tone} h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none`} style={{ width: `${progress}%` }} />}
    </div>}
  </div>;
}

export function BillingCapacity({ state }: { state: BillingState }) {
  const { t, locale } = useI18n();
  const copy = t.billing.resourcesGuide;
  const onboarding = t.billing.onboarding;
  // Only application limits fall back to the local catalog. Money and customer
  // credits always come from verified namespace billing, never reseller capacity.
  const limits = state.plan?.limits ?? PLANS[state.tier].limits;
  const cap = state.capacity;
  const number = (n: number) => formatBillingNumber(n, locale);
  const credits = (n: number) => formatMilliCredits(n, locale);

  if (state.tier === "free") {
    const projects = cap?.projects ?? { used: null, max: limits.maxProjects };
    return <section className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{copy.noPlan}</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{onboarding.workspaceDescription}</p>
        </div>
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"><Cloud className="size-5" aria-hidden="true" /></div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">{onboarding.includedCredits}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{number(0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{onboarding.noFreeCompute}</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">{copy.projects}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
            {projects.used == null ? "—" : number(projects.used)}
            {projects.max != null && <> <span className="text-sm font-normal tracking-normal text-muted-foreground">{interpolate(t.billing.capacity.of, { max: number(projects.max) })}</span></>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.setupOnly}</p>
        </div>
      </div>
      {state.balance.quotaRemaining != null && state.balance.quotaRemaining !== 0 && <div className="mt-4 rounded-xl bg-muted/30 p-4">
        <p className="text-sm font-medium">{onboarding.savedCredits}: {credits(state.balance.quotaRemaining)}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{onboarding.savedCreditsHint}</p>
      </div>}
      <div className="mt-5 space-y-3 border-t border-border/40 pt-5">
        {[{ Icon: Clock3, label: copy.buildTime }, { Icon: Layers3, label: copy.apps }].map(({ Icon, label }) => <div key={label} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{label}</span>
          <span className="text-xs font-medium text-muted-foreground">{onboarding.planRequired}</span>
        </div>)}
      </div>
    </section>;
  }

  const unlimitedCredits = hasUnlimitedCloudCredits(state);
  const buildMeter = cap?.buildMinutes ?? { used: state.buildTimeMinutes, max: limits.buildMinutesPerMonth };
  const serviceMeter = cap?.services ?? { used: null, max: limits.runningServices };
  const projectMeter = cap?.projects ?? { used: null, max: limits.maxProjects };
  const rows: RowSpec[] = [{
    key: "credits", label: t.billing.overview.usedThisPeriod, hint: copy.creditsHint,
    meter: { used: state.balance.quotaUsed, max: state.balance.quotaLimit }, format: credits, unlimited: unlimitedCredits,
  }, {
    key: "buildMinutes", label: copy.buildTime, hint: copy.buildHint,
    meter: buildMeter, format: number, unit: t.billing.header.min, unlimited: buildMeter.max === null,
  }, {
    key: "services", label: copy.apps, hint: copy.appsHint,
    meter: serviceMeter, format: number, unlimited: serviceMeter.max === null,
  }, {
    key: "projects", label: copy.projects, hint: copy.projectsHint,
    meter: projectMeter, format: number, unlimited: projectMeter.max === null,
  }];
  if (cap?.routes) rows.push({ key: "routes", label: t.billing.capacity.routes, hint: copy.routesHint, meter: cap.routes, format: number, unlimited: cap.routes.max === null });
  const spec = state.maxServiceMachine === undefined
    ? (limits.maxResourceTier ? RESOURCE_TIER_SPECS[limits.maxResourceTier] : null) : state.maxServiceMachine;
  const machine = spec ? `${formatCpuCores(spec.cpuCores)} · ${formatMemoryMb(spec.memoryMb)}` : limits.maxResourceTier === null ? copy.unlimited : "—";
  const resetAt = state.buildMinutesResetAt ? new Date(state.buildMinutesResetAt) : null;

  return <section className="rounded-2xl bg-card p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">{copy.credits}</h2>
        <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${state.overQuota ? "text-danger" : "text-foreground"}`}>
          {unlimitedCredits ? copy.unlimited : formatMilliCredits(state.balance.quotaRemaining, locale)}
          {!unlimitedCredits && <> <span className="text-sm font-normal tracking-normal text-muted-foreground">{t.billing.overview.creditsLeft}</span></>}
        </p>
      </div>
      <Cloud className="mt-1 size-5 text-muted-foreground/60" aria-hidden="true" />
    </div>
    <div className="mt-3 divide-y divide-border/40">
      {rows.map(({ key, ...row }) => <MeterRow key={key} {...row} />)}
      <div className="flex flex-wrap items-baseline justify-between gap-2 py-4">
        <MetricLabel label={copy.machine} hint={copy.machineHint} />
        <span className="text-sm font-medium tabular-nums">{machine}</span>
      </div>
    </div>
    {resetAt && Number.isFinite(resetAt.getTime()) && <p className="border-t border-border/40 pt-4 text-xs text-muted-foreground">
      {interpolate(copy.reset, { date: resetAt.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) })}
    </p>}
  </section>;
}

export default BillingCapacity;
