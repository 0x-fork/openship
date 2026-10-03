import { resolvePlan, toPricingLocale } from "@repo/core";
import type { ApiPlan } from "./PricingCards";

/** Offer choices use the saved purchase, not today's tier name or price.
 * The provider still quotes and validates every change before payment. */
export function serverPlanChoices({ plans, currentOffer, interval, allocatedDiskGb = 0 }: {
  plans: ApiPlan[];
  currentOffer?: ApiPlan | null;
  interval: "monthly" | "annual";
  allocatedDiskGb?: number | null;
}) {
  const capacity = currentOffer ? planCapacity(currentOffer) : null;
  const price = currentOffer?.price[interval];
  const minimumDisk = allocatedDiskGb ?? 0;
  const available = plans.filter(plan => {
    const amount = plan.price[interval];
    const disk = plan.resourceLimits?.max_total_disk_gb;
    return amount != null && amount > 0 && (minimumDisk <= 0 || (disk != null && disk >= minimumDisk));
  });
  const matchesCurrent = (plan: ApiPlan) => {
    if (!currentOffer || currentOffer.configuration === "custom" || plan.id !== currentOffer.id || plan.price[interval] !== price) return false;
    if (plan.offerReference && currentOffer.offerReference && plan.offerReference !== currentOffer.offerReference) return false;
    if (interval === "annual" ? plan.annualCredits !== currentOffer.annualCredits : plan.monthlyCredits !== currentOffer.monthlyCredits) return false;
    const candidate = planCapacity(plan);
    return capacity && candidate
      ? candidate.cpu === capacity.cpu && candidate.memoryGb === capacity.memoryGb && candidate.diskGb === capacity.diskGb
      : !capacity && !candidate;
  };
  const current = available.find(matchesCurrent)?.id ?? null;
  const upgrades = available.filter(plan => {
    if (price == null || plan.price[interval]! <= price || matchesCurrent(plan)) return false;
    const next = planCapacity(plan);
    if (!capacity || !next) return !capacity && !next;
    return next.cpu >= capacity.cpu && next.memoryGb >= capacity.memoryGb && next.diskGb >= capacity.diskGb
      && (next.cpu > capacity.cpu || next.memoryGb > capacity.memoryGb || next.diskGb > capacity.diskGb);
  });
  return { available, upgrades, current, other: available.filter(plan => plan.id !== current && !upgrades.includes(plan)) };
}

/** Only explicit capacity can be advertised. Null provider limits are inherited. */
export function planCapacity(plan: ApiPlan) {
  const pool = plan.resourceLimits;
  if (!pool) return null;
  const { max_total_vcpus: cpu, max_total_ram_mb: ram, max_total_disk_gb: disk } = pool;
  if (cpu === null || ram === null || disk === null || ![cpu, ram, disk].every(Number.isFinite))
    return null;
  return { cpu, memoryGb: ram / 1024, diskGb: disk };
}

/** These facts already have dedicated resource rows or the shared usage note. */
const RESOURCE_FEATURES = new Set([
  "usageCredits",
  "finiteUsage",
  "runningServices",
  "oneRunningService",
  "power",
  "projects",
  "projectsUnlimited",
  "buildMinutes",
  "meteredBuilds",
  "freeSubdomains",
  "freeSubdomainsUnlimited",
]);

export function additionalPlanFeatures(plan: ApiPlan, locale = "en"): string[] {
  let keys = plan.featureKeys;
  if (!keys) {
    // An older Cloud API can serve the same catalog without keys. Only recognize
    // an exact match of the complete published list; never parse individual copy.
    const catalog = resolvePlan(plan.id, toPricingLocale(locale));
    if (
      catalog.features.length === plan.features.length &&
      catalog.features.every((feature, index) => feature === plan.features[index])
    ) {
      keys = catalog.featureKeys;
    }
  }
  // Preserve every benefit from unfamiliar or mismatched catalogs.
  if (keys?.length !== plan.features.length) return plan.features;
  const hasCapacity = planCapacity(plan) !== null;
  return plan.features.filter((_, index) => {
    const key = keys[index]!;
    return !RESOURCE_FEATURES.has(key) && !(hasCapacity && key === "namespaceCapacity");
  });
}
