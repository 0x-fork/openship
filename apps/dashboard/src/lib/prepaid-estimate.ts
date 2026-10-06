import type { BillingPlans } from "@repo/contracts";
import type { CustomServerResources } from "@repo/core";

/** Suggested deposits for the UI preview. These are not legacy allowance packs
 * or checkout offers; no payment or capacity API accepts these selections. */
export const PREPAID_PACKAGE_CENTS = [500, 2000, 5000, 10000] as const;
export type ComputePricing = NonNullable<BillingPlans["computePricing"]>;

export function hasPrepaidRates(
  pricing: BillingPlans["computePricing"],
): pricing is ComputePricing {
  return Boolean(
    pricing &&
    pricing.currency === "usd" &&
    [
      pricing.creditsPerDollar,
      pricing.usage.activeVcpuHourCents,
      pricing.usage.reservedGiBHourCents,
      pricing.usage.retainedGiBMonthCents,
      pricing.usage.monthHours,
    ].every((value) => Number.isFinite(value) && value > 0),
  );
}

/** Presentation only: published resource rates applied to prepaid usage.
 * Estimates assume identical hosts and constant utilization.
 * This must never be used for wallet debits, admission or paid entitlement. */
export function estimatePrepaidUsage({
  pricing,
  resources,
  packageCents,
  serverCount,
  cpuPercent,
}: {
  pricing: BillingPlans["computePricing"];
  resources: CustomServerResources;
  packageCents: number;
  serverCount: number;
  cpuPercent: number;
}) {
  if (
    !hasPrepaidRates(pricing) ||
    ![
      resources.cpuCores,
      resources.memoryMb,
      resources.diskGb,
      packageCents,
      serverCount,
    ].every((value) => Number.isSafeInteger(value) && value > 0) ||
    !Number.isFinite(cpuPercent) ||
    cpuPercent < 0 ||
    cpuPercent > 100
  )
    return null;

  const creditsPerCent = pricing.creditsPerDollar / 100;
  const monthHours = pricing.usage.monthHours;
  // Resource-hours consumed during ONE elapsed hour across the selected hosts.
  // CPU activity is a fraction of each host's allocated vCPUs, not an hour count.
  const hourlyUsage = {
    cpuVcpuHours: ((resources.cpuCores * cpuPercent) / 100) * serverCount,
    memoryGiBHours: (resources.memoryMb / 1024) * serverCount,
    storageGiBHours: resources.diskGb * serverCount,
  };
  const hourlyCents = {
    cpu: hourlyUsage.cpuVcpuHours * pricing.usage.activeVcpuHourCents,
    memory: hourlyUsage.memoryGiBHours * pricing.usage.reservedGiBHourCents,
    disk: (hourlyUsage.storageGiBHours * pricing.usage.retainedGiBMonthCents) / monthHours,
  };
  const totalHourlyCents = hourlyCents.cpu + hourlyCents.memory + hourlyCents.disk;
  const idleHourlyCents = hourlyCents.memory + hourlyCents.disk;
  const fullCpuCents = resources.cpuCores * serverCount * pricing.usage.activeVcpuHourCents;
  const fullCpuHourlyCents = fullCpuCents + idleHourlyCents;
  if (
    ![totalHourlyCents, idleHourlyCents, fullCpuHourlyCents, packageCents * creditsPerCent].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const coveredElapsedHours = packageCents / totalHourlyCents;
  const durationRange = {
    minElapsedHours: packageCents / fullCpuHourlyCents,
    maxElapsedHours: packageCents / idleHourlyCents,
  };
  if (
    ![
      coveredElapsedHours,
      durationRange.minElapsedHours,
      durationRange.maxElapsedHours,
    ].every((value) => Number.isFinite(value) && value > 0)
  )
    return null;

  return {
    balanceCredits: packageCents * creditsPerCent,
    hourlyUsage,
    hourlyCents,
    totalHourlyCents,
    hourlyCredits: totalHourlyCents * creditsPerCent,
    coveredElapsedHours,
    // Only CPU activity varies. RAM and retained storage stay charged at both
    // ends; this is an estimate range, not a guaranteed lifetime for the funds.
    durationRange,
  };
}
