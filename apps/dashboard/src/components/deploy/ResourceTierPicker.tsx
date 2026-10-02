"use client";

import { useId, useState } from "react";
import {
  MIN_CPU_CORES, MIN_MEMORY_MB, RESOURCE_TIER_ORDER, RESOURCE_TIER_SPECS,
  UNKNOWN_CAPACITY, formatCpuCores, formatMemoryMb, validateAgainstCapacity,
  type HostCapacity, type ResourceTier, type ResourceValues,
} from "@repo/core";
import { Icon } from "@repo/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, interpolate } from "@/components/i18n-provider";

export type ResourceLimitValues = Pick<ResourceValues, "cpuCores" | "memoryMb">;

/** Every surface reads the same tier copy, with a fallback for a missing translation. */
export function useResourceTierLabels() {
  const { t } = useI18n();
  const copy = t.projectSettings.resources;
  const details = (tier: ResourceTier): { name?: string; description?: string } | undefined =>
    tier === "custom" ? copy.custom : (copy.tiers as Record<string, { name?: string; description?: string }>)[tier];
  return {
    name: (tier: ResourceTier) => details(tier)?.name ?? tier,
    description: (tier: ResourceTier) => details(tier)?.description ?? "",
    spec: (tier: ResourceTier, custom: ResourceLimitValues) => {
      if (tier === "unlimited") return copy.tiers.unlimited.spec;
      const values = tier === "custom" ? custom : RESOURCE_TIER_SPECS[tier];
      return values.cpuCores || values.memoryMb
        ? `${formatCpuCores(values.cpuCores)} · ${formatMemoryMb(values.memoryMb)}`
        : copy.custom.notSet;
    },
  };
}

interface ResourceTierPickerProps {
  value: ResourceTier;
  values: ResourceLimitValues;
  requiresLimit?: boolean;
  capacity?: Pick<HostCapacity, "cpuCores" | "memoryMb">;
  saving?: ResourceTier | null;
  disabled?: boolean;
  /** False keeps a custom draft open after a failed save. */
  onSelect: (tier: ResourceTier, values?: ResourceLimitValues) => void | boolean | Promise<boolean>;
}

/** Project settings and deployment setup share the same limits editor. */
export function ResourceTierPicker({ value, values, requiresLimit = false, capacity, saving, disabled, onSelect }: ResourceTierPickerProps) {
  const { t } = useI18n();
  const copy = t.projectSettings.resources;
  const labels = useResourceTierLabels();
  const fieldId = useId();
  const [draft, setDraft] = useState<{ cpu: string; memory: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const selected = draft ? "custom" : value;
  const tiers: ResourceTier[] = requiresLimit ? [...RESOURCE_TIER_ORDER, "custom"] : ["unlimited", ...RESOURCE_TIER_ORDER, "custom"];
  const busy = disabled || !!saving;
  const custom = draft ? { cpuCores: Number(draft.cpu), memoryMb: Number(draft.memory) } : values;
  const invalidNumbers = !Number.isFinite(custom.cpuCores) || !Number.isFinite(custom.memoryMb)
    || custom.cpuCores < 0 || custom.memoryMb < 0
    || (requiresLimit && (custom.cpuCores === 0 || custom.memoryMb === 0));
  const invalidCustom = invalidNumbers || !!validateAgainstCapacity(
    { ...custom, diskMb: 0 }, { ...UNKNOWN_CAPACITY, ...capacity },
  );
  const incomplete = !!draft && (!draft.cpu.trim() || !draft.memory.trim());

  const commit = async (tier: ResourceTier, customValues?: ResourceLimitValues) => {
    if (busy) return;
    setSaveError(false);
    try {
      if (await onSelect(tier, customValues) !== false) setDraft(null);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="@container/resources space-y-3">
      <div className="grid grid-cols-1 gap-2.5 @min-[24rem]/resources:grid-cols-2 @min-[40rem]/resources:grid-cols-3">
        {tiers.map(tier => {
          const active = selected === tier;
          const overCapacity = tier !== "custom" && tier !== "unlimited" && capacity && (
            (capacity.cpuCores > 0 && RESOURCE_TIER_SPECS[tier].cpuCores > capacity.cpuCores)
            || (capacity.memoryMb > 0 && RESOURCE_TIER_SPECS[tier].memoryMb > capacity.memoryMb)
          );
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              disabled={busy || !!overCapacity}
              onClick={() => {
                if (tier === "custom") {
                  setDraft({ cpu: String(values.cpuCores), memory: String(values.memoryMb) });
                  setSaveError(false);
                } else void commit(tier);
              }}
              className={`${tier === "unlimited" ? "col-span-full " : ""}flex items-start gap-3 rounded-xl p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-primary/10 ring-1 ring-primary/25" : "bg-muted/60 hover:bg-muted"}`}
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon name={saving === tier ? "spinner" : tier === "unlimited" ? "infinity" : tier === "custom" ? "sliders" : "cpu"} className={`size-4 ${saving === tier ? "animate-spin" : ""}`} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-foreground">{labels.name(tier)}</span>
                <span className="text-xs text-muted-foreground">{labels.description(tier)}</span>
                <span className="mt-1 text-xs font-medium text-foreground/70">
                  {overCapacity ? copy.exceedsMachine : <bdi dir={tier === "unlimited" || (tier === "custom" && !values.cpuCores && !values.memoryMb) ? "auto" : "ltr"}>{labels.spec(tier, values)}</bdi>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {draft && (
        <div className="space-y-4 rounded-xl bg-muted/30 p-4">
          {capacity && <p className="text-xs text-muted-foreground">{interpolate(copy.machineCapacity, { cpu: String(capacity.cpuCores), memory: formatMemoryMb(capacity.memoryMb) })}</p>}
          <div className="grid grid-cols-1 gap-4 @min-[24rem]/resources:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-cpu`} className="text-sm font-medium">{copy.customPanel.cpuCores}</label>
              <Input id={`${fieldId}-cpu`} aria-describedby={`${fieldId}-cpu-hint`} type="number" variant="filled" min={requiresLimit ? MIN_CPU_CORES : 0} max={capacity?.cpuCores || undefined} step="0.25" value={draft.cpu} disabled={busy} onChange={event => setDraft({ ...draft, cpu: event.target.value })} />
              <p id={`${fieldId}-cpu-hint`} className="text-xs text-muted-foreground">
                <bdi dir={requiresLimit ? "ltr" : "auto"}>
                {requiresLimit ? (capacity?.cpuCores
                  ? `${formatCpuCores(MIN_CPU_CORES)} – ${formatCpuCores(capacity.cpuCores)}`
                  : `≥ ${formatCpuCores(MIN_CPU_CORES)}`) : copy.customPanel.zeroMeansNoLimit}
                </bdi>
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-memory`} className="text-sm font-medium">{copy.customPanel.memory}</label>
              <Input id={`${fieldId}-memory`} aria-describedby={`${fieldId}-memory-hint`} type="number" variant="filled" min={requiresLimit ? MIN_MEMORY_MB : 0} max={capacity?.memoryMb || undefined} step="128" value={draft.memory} disabled={busy} onChange={event => setDraft({ ...draft, memory: event.target.value })} />
              <p id={`${fieldId}-memory-hint`} className="text-xs text-muted-foreground">
                <bdi dir={requiresLimit ? "ltr" : "auto"}>
                {requiresLimit ? (capacity?.memoryMb
                  ? `${formatMemoryMb(MIN_MEMORY_MB)} – ${formatMemoryMb(capacity.memoryMb)}`
                  : `≥ ${formatMemoryMb(MIN_MEMORY_MB)}`) : copy.customPanel.zeroMeansNoLimit}
                </bdi>
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setDraft(null); setSaveError(false); }}>{copy.customPanel.cancel}</Button>
            <Button type="button" disabled={busy || incomplete || invalidCustom} onClick={() => void commit("custom", custom)}>{saving ? copy.customPanel.saving : copy.customPanel.save}</Button>
          </div>
        </div>
      )}
      {saveError && <p role="alert" className="text-sm text-danger">{copy.toast.updateFailed}</p>}
    </div>
  );
}
