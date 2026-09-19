"use client";

import React from "react";
import { Cloud } from "lucide-react";
import { PLANS, RESOURCE_TIER_SPECS, formatCpuCores, formatMemoryMb } from "@repo/core";
import { useI18n, interpolate } from "@/components/i18n-provider";
import type { BillingState, CapacityMeter } from "@/lib/api/billing";
import { formatBillingNumber, formatMilliCredits } from "@/lib/billing-usage";

export type { BillingState };

interface RowSpec {
  key: string;
  label: string;
  hint: string;
  meter: CapacityMeter;
  /** Render a raw resource value (already in display units) → string. */
  format: (n: number) => string;
  /** Unit suffix shown after formatted values (e.g. "GB"). */
  unit?: string;
}

function pct(used: number, max: number): number {
  if (max <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (used / max) * 100));
}

/** Threshold tone — same scale the overview ring uses. Applied as a text color
 *  so the bar fill can inherit it via `bg-current`. */
function toneClass(p: number): string {
  if (p >= 90) return "text-danger";
  if (p >= 75) return "text-warning";
  return "text-primary";
}

function MeterRow({ label, hint, meter, format, unit }: Omit<RowSpec, "key">) {
  const { t } = useI18n();
  const c = t.billing.capacity;
  const suffix = unit ? ` ${unit}` : "";

  const hasMax = meter.max != null;
  const hasUsed = meter.used != null;
  const p = hasMax && hasUsed ? pct(meter.used!, meter.max!) : 0;
  const tone = toneClass(p);

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {hasUsed ? (
            <>
              <span className="font-semibold text-foreground">
                {format(meter.used!)}
                {suffix}
              </span>
              {hasMax ? (
                <span className="ms-1">
                  {interpolate(c.of, { max: `${format(meter.max!)}${suffix}` })}
                </span>
              ) : (
                <span className="ms-1">· {c.unlimited}</span>
              )}
            </>
          ) : hasMax ? (
            // Ceiling known (from the plan), live usage not yet reported.
            <span className="inline-flex items-center gap-1">
              <Cloud className="size-3" />
              {c.syncing}
              <span className="ms-1 text-foreground">
                · {format(meter.max!)}
                {suffix}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Cloud className="size-3" />
              {c.syncing}
            </span>
          )}
        </span>
      </div>

      {hasMax && meter.max! > 0 && <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role={hasUsed ? "progressbar" : undefined} aria-label={label}
        aria-valuemin={hasUsed ? 0 : undefined} aria-valuemax={hasUsed ? meter.max! : undefined}
        aria-valuenow={hasUsed ? Math.min(meter.max!, Math.max(0, meter.used!)) : undefined}
        aria-valuetext={hasUsed ? `${format(meter.used!)}${suffix} ${interpolate(c.of, { max: `${format(meter.max!)}${suffix}` })}` : undefined}>
        {hasUsed && <div className={`${tone} h-full rounded-full bg-current transition-[width] duration-500`} style={{ width: `${p}%` }} />}
      </div>}
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

/** A ceiling with no meter: a labelled value, no bar. Used for figures that are
 *  a per-unit SIZE rather than a pool — drawing a progress track under one would
 *  imply a total that gets consumed. */
function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export const BillingCapacity: React.FC<{ state: BillingState }> = ({ state }) => {
  const { t, locale } = useI18n();
  const copy = t.billing.resourcesGuide;
  const c = t.billing.capacity;
  const limits = state.plan?.limits ?? PLANS[state.tier]?.limits ?? null;
  const cap = state.capacity;
  const isFree = state.tier === "free";
  const number = (n: number) => formatBillingNumber(n, locale);
  const credits = (n: number) => formatMilliCredits(n, locale);
  const rows: RowSpec[] = [{
    key: "credits", label: copy.credits, hint: copy.creditsHint,
    meter: { used: state.balance.quotaUsed, max: state.balance.quotaLimit }, format: credits,
  }];
  // Free accounts can configure projects, but a catalog ceiling is not a grant
  // of Cloud compute. Never advertise the legacy free build ceiling as included.
  if (!isFree) {
    rows.push({
      key: "buildMinutes", label: copy.buildTime, hint: copy.buildHint,
      meter: cap?.buildMinutes ?? { used: state.buildTimeMinutes, max: limits?.buildMinutesPerMonth ?? null },
      format: number, unit: t.billing.header.min,
    }, {
      key: "services", label: copy.apps, hint: copy.appsHint,
      meter: cap?.services ?? { used: null, max: limits?.runningServices ?? null }, format: number,
    });
  }
  rows.push({
    key: "projects", label: copy.projects, hint: copy.projectsHint,
    meter: cap?.projects ?? { used: null, max: limits?.maxProjects ?? null }, format: number,
  });
  if (!isFree && cap?.routes) rows.push({ key: "routes", label: c.routes, hint: copy.routesHint, meter: cap.routes, format: number });

  const sizeTier = limits?.maxResourceTier ?? null;
  const spec = state.maxServiceMachine === undefined
    ? (sizeTier ? RESOURCE_TIER_SPECS[sizeTier] : null) : state.maxServiceMachine;
  const machineSize = spec ? `${formatCpuCores(spec.cpuCores)} · ${formatMemoryMb(spec.memoryMb)}` : copy.unlimited;
  const resetAt = state.buildMinutesResetAt ? new Date(state.buildMinutesResetAt) : null;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <h2 className="text-base font-semibold text-foreground">{copy.includedTitle}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{isFree ? copy.setupHint : copy.limitsHint}</p>
      <div className="mt-2 divide-y divide-border/50">
        {rows.map(({ key, ...row }) => <MeterRow key={key} {...row} />)}
        {isFree ? <>
          <ValueRow label={copy.buildTime} value={copy.notIncluded} />
          <ValueRow label={copy.apps} value={copy.notIncluded} />
        </> : <div>
          <ValueRow label={copy.machine} value={machineSize} />
          <p className="pb-3 text-xs leading-relaxed text-muted-foreground">{copy.machineHint}</p>
        </div>}
      </div>
      {!isFree && resetAt && Number.isFinite(resetAt.getTime()) && <p className="mt-3 text-xs text-muted-foreground">
        {interpolate(copy.reset, { date: resetAt.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) })}
      </p>}
    </div>
  );
};

export default BillingCapacity;
