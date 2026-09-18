import { AppError, planLimits, PRICING, RESOURCE_TIER_SPECS, type PlanTierId } from "@repo/core";
import type { Oblien } from "@repo/adapters";
import { getOblienClient } from "./oblien-client";

type NamespaceLimits = NonNullable<Parameters<Oblien["namespaces"]["update"]>[1]["resource_limits"]>;
interface AccountCapacity { cpu: number; memory: number; diskGb: number; workspaces: number }

/** Account limits are ceilings, not the account's currently unused capacity. */
export function cloudAccountCapacity(input: unknown): AccountCapacity {
  const data = input as { success?: boolean; limits?: { cpus?: number; memory_mb?: number; disk_size_mb?: number }; maxSandboxes?: number } | null;
  const values = [data?.limits?.cpus, data?.limits?.memory_mb, data?.limits?.disk_size_mb, data?.maxSandboxes];
  if (!data?.success || values.some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    throw new AppError("Cloud resource capacity could not be verified", 503, "CLOUD_CAPACITY_UNAVAILABLE");
  }
  return { cpu: values[0]!, memory: values[1]!, diskGb: Math.floor(values[2]! / 1024), workspaces: values[3]! };
}

/** A namespace must fit both native build VMs and a whole Compose stack. Its
 * containers still receive the plan's individual CPU/memory limits. */
export function cloudNamespaceLimits(tier: PlanTierId, account: AccountCapacity): NamespaceLimits {
  const plan = planLimits(tier);
  if (plan.runningServices === null && plan.maxResourceTier === null) {
    return { max_workspaces: null, max_vcpus: null, max_ram_mb: null, max_disk_gb: null };
  }
  const build = PRICING.oblien.buildResources;
  const service = plan.maxResourceTier ? RESOURCE_TIER_SPECS[plan.maxResourceTier] : null;
  const count = plan.runningServices;
  return {
    max_workspaces: Math.min(account.workspaces, count === null ? account.workspaces : count + PRICING.oblien.buildWorkspaceHeadroom),
    max_vcpus: Math.min(account.cpu, Math.ceil(Math.max(build.cpuCores, 2, service && count !== null ? service.cpuCores * count : account.cpu))),
    max_ram_mb: Math.min(account.memory, Math.max(build.memoryMb, 4096, service && count !== null ? build.memoryMb + service.memoryMb * count : account.memory)),
    max_disk_gb: Math.min(account.diskGb, Math.max(32, build.diskGb, service ? Math.ceil(service.diskMb / 1024) : account.diskGb)),
  };
}

let capacity: { until: number; value: AccountCapacity } | undefined;
async function accountCapacity(): Promise<AccountCapacity> {
  if (capacity && capacity.until > Date.now()) return capacity.value;
  const value = cloudAccountCapacity(await getOblienClient().workspaces.getQuota());
  capacity = { value, until: Date.now() + 60_000 };
  return value;
}

export async function initialCloudNamespaceLimits(): Promise<NamespaceLimits> {
  return cloudNamespaceLimits("free", await accountCapacity());
}

/** Called under the billing lock, after reading the provider's current tier.
 * Only resource ceilings change here: credit grants, usage and suspension remain
 * provider-owned. A downgrade never deletes or shrinks an existing VM. */
export async function syncCloudResourceLimits(namespace: string, tier: PlanTierId): Promise<void> {
  const client = getOblienClient();
  const desired = cloudNamespaceLimits(tier, await accountCapacity());
  const { data: current } = await client.namespaces.get(namespace);
  if (current.slug !== namespace) throw new AppError("Cloud namespace ownership changed", 502, "CLOUD_NAMESPACE_MISMATCH");
  const matches = (limits: NamespaceLimits | null | undefined) =>
    (Object.keys(desired) as Array<keyof NamespaceLimits>).every(key => (limits?.[key] ?? null) === desired[key]);
  if (matches(current.resource_limits)) return;
  const { data: updated } = await client.namespaces.update(current.id, { resource_limits: desired });
  if (updated.slug !== namespace || !matches(updated.resource_limits)) {
    throw new AppError("Cloud resource limits were not confirmed", 502, "CLOUD_RESOURCE_LIMITS_UNCONFIRMED");
  }
}

export function __resetCloudResourceCapacityForTests(): void { capacity = undefined; }
