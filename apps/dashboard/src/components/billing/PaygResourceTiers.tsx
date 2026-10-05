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
    <section aria-label={copy.label} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-medium">{copy.label}</h4>
        <Tabs
          tabs={tiers.map(tier => ({ key: tier.id, label: name(tier) }))}
          value={selected.id}
          onChange={onChange}
          idPrefix={id}
          ariaLabel={copy.label}
          size="sm"
          className="border-b-0"
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {interpolate(copy.unlock, { amount: money(selected.minimumFundingCents) })}
      </p>
      {tiers.map(tier => {
        const usage = resources ? previewPaygPool(tier, resources, serverCount) : null;
        return (
          <div key={tier.id} id={`${id}-panel-${tier.id}`} role="tabpanel"
            aria-labelledby={`${id}-tab-${tier.id}`} hidden={tier.id !== selected.id}>
            <div className="mt-3 rounded-xl bg-muted/40 p-3.5">
              <p className="text-xs text-muted-foreground">{copy.configured}</p>
              <ul aria-label={copy.hint} className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-3">
                {fields.map(({ key, label, divisor, unit }) => {
                  const limit = tier.pool[key];
                  const configured = usage?.selected[key];
                  const exceeded = configured !== undefined && configured > limit;
                  return (
                    <li key={key} className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <bdi dir="ltr" className="inline-flex items-baseline gap-x-1 text-xs tabular-nums">
                          <span className={cn("font-semibold", exceeded && "text-warning")}>
                            {configured === undefined ? "—" : number(configured / divisor)}
                          </span>
                          <span className="text-muted-foreground">/ {number(limit / divisor)} {unit}</span>
                        </bdi>
                      </div>
                      <div role="meter" aria-label={`${label} · ${copy.configured}`} aria-valuemin={0}
                        aria-valuemax={limit} aria-valuenow={Math.min(configured ?? 0, limit)}
                        aria-valuetext={configured === undefined ? copy.unavailable : `${number(configured / divisor)} / ${number(limit / divisor)} ${unit}`}
                        className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full transition-[width] motion-reduce:transition-none", exceeded ? "bg-warning" : "bg-primary/70")}
                          style={{ width: `${configured === undefined ? 0 : Math.min(100, configured / limit * 100)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
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
