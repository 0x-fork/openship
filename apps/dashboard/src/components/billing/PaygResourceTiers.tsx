"use client";

import { useId } from "react";
import type { CustomServerResources } from "@repo/core";
import { interpolate, useI18n } from "@/components/i18n-provider";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { previewPaygPool, type PaygTier } from "@/lib/prepaid-estimate";

/** Tier selection describes a prospective pool; it never grants paid access. */
export function PaygResourceTiers({
  tiers, selected, onChange, resources, serverCount, money,
}: {
  tiers: PaygTier[];
  selected: PaygTier;
  onChange: (id: string) => void;
  resources: CustomServerResources | null;
  serverCount: number;
  money: (cents: number) => string;
}) {
  const { t, locale } = useI18n();
  const copy = t.billing.purchase.tiers;
  const id = useId();
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const name = (tier: PaygTier) => interpolate(copy.name, { level: number(tier.level) });
  const preview = resources ? previewPaygPool(selected, resources, serverCount) : null;
  const larger = resources && preview && !preview.fits
    ? tiers.find(tier => previewPaygPool(tier, resources, serverCount)?.fits)
    : null;
  const fields = [
    { key: "cpuCores", label: t.billing.custom.cpu, divisor: 1, unit: "vCPU" },
    { key: "memoryMb", label: t.billing.custom.memory, divisor: 1024, unit: "GiB" },
    { key: "diskGb", label: t.billing.custom.disk, divisor: 1, unit: "GiB" },
    { key: "servers", label: copy.servers, divisor: 1, unit: "" },
  ] as const;

  return (
    <section aria-label={copy.label} className="@container/pool min-w-0 rounded-2xl bg-card px-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-border/50">
        <Tabs
          tabs={tiers.map(tier => ({ key: tier.id, label: name(tier) }))}
          value={selected.id}
          onChange={onChange}
          idPrefix={id}
          ariaLabel={copy.label}
          className="border-b-0"
        />
        <p className="pb-2 text-xs text-muted-foreground @min-[40rem]/pool:pb-0">
          {interpolate(copy.unlock, { amount: money(selected.minimumFundingCents) })}
        </p>
      </div>
      {tiers.map(tier => {
        const usage = resources ? previewPaygPool(tier, resources, serverCount) : null;
        return (
          <div key={tier.id} id={`${id}-panel-${tier.id}`} role="tabpanel"
            aria-labelledby={`${id}-tab-${tier.id}`} hidden={tier.id !== selected.id}>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 @min-[40rem]/pool:grid-cols-4">
              {fields.map(({ key, label, divisor, unit }) => {
                const limit = tier.pool[key];
                const configured = usage?.selected[key];
                const exceeded = configured !== undefined && configured > limit;
                return (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 tabular-nums">
                      <bdi dir="ltr" className="inline-flex flex-wrap items-baseline gap-x-1.5">
                        <span className={cn("text-lg font-semibold", exceeded && "text-warning")}>
                          {configured === undefined ? "—" : number(configured / divisor)}
                        </span>
                        <span className="text-sm text-muted-foreground">/ {number(limit / divisor)} {unit}</span>
                      </bdi>
                    </dd>
                    <div role="meter" aria-label={`${label} · ${copy.configured}`} aria-valuemin={0}
                      aria-valuemax={limit} aria-valuenow={Math.min(configured ?? 0, limit)}
                      aria-valuetext={configured === undefined ? copy.unavailable : `${number(configured / divisor)} / ${number(limit / divisor)} ${unit}`}
                      className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", exceeded ? "bg-warning" : "bg-primary/70")}
                        style={{ width: `${configured === undefined ? 0 : Math.min(100, configured / limit * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
      <p className="mt-3 text-xs text-muted-foreground">{copy.hint}</p>
      {preview && !preview.fits && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning/10 px-3 py-2.5">
          <p className="text-sm">{interpolate(copy.exceeded, { tier: name(selected) })}</p>
          {larger && (
            <Button type="button" size="sm" variant="secondary" onClick={() => onChange(larger.id)}>
              {interpolate(copy.choose, { tier: name(larger) })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
