import { AppError, planLimits, PRICING, RESOURCE_TIER_SPECS, type PlanTierId } from "@repo/core";
import type { Oblien } from "@repo/adapters";
import { z } from "zod";
import { getOblienClient } from "./oblien-client";

type NamespaceLimits = NonNullable<Parameters<Oblien["namespaces"]["update"]>[1]["resource_limits"]>;

/** The plan's resource envelope, before applying the provider's per-VM ceiling.
 * Services may span multiple projects; one Compose project still runs in one VM.
 * The customer's service count and credits never come from reseller capacity. */
export function cloudNamespaceLimits(
  tier: PlanTierId,
): Required<Pick<NamespaceLimits, "max_workspaces" | "max_vcpus" | "max_ram_mb" | "max_disk_gb">> {
  const plan = planLimits(tier);
  const build = PRICING.oblien.buildResources;
  const service = plan.maxResourceTier ? RESOURCE_TIER_SPECS[plan.maxResourceTier] : null;
  const count = plan.runningServices;
  return {
    max_workspaces: count === null ? null : count + PRICING.oblien.buildWorkspaceHeadroom,
    max_vcpus: service && count !== null ? Math.ceil(Math.max(build.cpuCores, 2, service.cpuCores * count)) : null,
    max_ram_mb: service && count !== null ? Math.max(build.memoryMb, 4096, build.memoryMb + service.memoryMb * count) : null,
    max_disk_gb: service ? Math.max(32, build.diskGb, Math.ceil(service.diskMb / 1024)) : null,
  };
}

export async function initialCloudNamespaceLimits(): Promise<NamespaceLimits> {
  return cloudNamespaceLimits("free");
}

const providerCapacitySchema = z.object({
  success: z.literal(true),
  limits: z.object({
    cpus: z.number().int().positive(),
    memory_mb: z.number().int().positive(),
    disk_size_mb: z.number().int().positive(),
  }),
  maxSandboxes: z.number().int().nonnegative().nullable(),
});

/** Enterprise has no account pool/count cap, but each VM still has a ceiling.
 * Intersect only per-VM sizes; never replace a customer's finite allowance with
 * the owner's unlimited capacity. Saved offers are copied, never rewritten. */
export async function fitCloudNamespaceLimits(desired: NamespaceLimits): Promise<NamespaceLimits> {
  let response: unknown;
  try {
    response = await getOblienClient().workspaces.getQuota();
  } catch {
    throw new AppError("Cloud machine capacity could not be verified. Please retry.", 503, "CLOUD_CAPACITY_UNAVAILABLE");
  }
  const parsed = providerCapacitySchema.safeParse(response);
  if (!parsed.success) {
    throw new AppError("Cloud returned invalid machine capacity. Please retry.", 502, "CLOUD_CAPACITY_INVALID");
  }
  const { limits, maxSandboxes } = parsed.data;
  if (desired.max_workspaces != null && maxSandboxes !== null && desired.max_workspaces > maxSandboxes) {
    throw new AppError("The Cloud provider account cannot support this plan's workspace allowance. Contact Openship support.", 503, "CLOUD_ACCOUNT_CAPACITY_INSUFFICIENT");
  }
  const fitted = { ...desired };
  const ceilings = {
    max_vcpus: limits.cpus,
    max_ram_mb: limits.memory_mb,
    max_disk_gb: Math.floor(limits.disk_size_mb / 1024),
  };
  for (const key of Object.keys(ceilings) as Array<keyof typeof ceilings>) {
    const requested = desired[key];
    if (requested != null) fitted[key] = Math.min(requested, ceilings[key]);
  }
  return fitted;
}

/** Check a new sale before redirecting to payment. A plan must fit its build
 * machine and at least one service in a Compose VM; larger stacks can span
 * projects without changing the plan's organization-wide service allowance. */
export async function checkoutCloudNamespaceLimits(tier: PlanTierId): Promise<ReturnType<typeof cloudNamespaceLimits>> {
  const desired = cloudNamespaceLimits(tier);
  const fitted = await fitCloudNamespaceLimits(desired);
  const build = PRICING.oblien.buildResources;
  const resourceTier = planLimits(tier).maxResourceTier;
  const service = resourceTier ? RESOURCE_TIER_SPECS[resourceTier] : null;
  const minimum = {
    max_vcpus: Math.ceil(Math.max(2, build.cpuCores, service?.cpuCores ?? 0)),
    max_ram_mb: Math.max(4096, build.memoryMb + (service?.memoryMb ?? 0)),
    max_disk_gb: Math.max(32, build.diskGb, Math.ceil((service?.diskMb ?? 0) / 1024)),
  };
  for (const key of Object.keys(minimum) as Array<keyof typeof minimum>) {
    if (fitted[key] != null && fitted[key]! < minimum[key]) {
      throw new AppError("The Cloud provider account cannot fit this plan's build and service machines. Contact Openship support.", 503, "CLOUD_ACCOUNT_CAPACITY_INSUFFICIENT");
    }
  }
  return { ...desired, ...fitted };
}

/** Called under the billing lock, after reading the provider's current tier.
 * Only resource ceilings change here: credit grants, usage and suspension remain
 * provider-owned. A downgrade never deletes or shrinks an existing VM. */
export async function syncCloudResourceLimits(
  namespace: string,
  tier: PlanTierId,
  desired: NamespaceLimits = cloudNamespaceLimits(tier),
): Promise<void> {
  const client = getOblienClient();
  const { data: current } = await client.namespaces.get(namespace);
  if (current.slug !== namespace) throw new AppError("Cloud namespace ownership changed", 502, "CLOUD_NAMESPACE_MISMATCH");
  // Old offers may contain a whole organization's aggregate Compose envelope
  // (e.g. 50 x 4 CPUs). Oblien validates these fields as per-VM caps on update.
  const fitted = await fitCloudNamespaceLimits(desired);
  const matches = (limits: NamespaceLimits | null | undefined) =>
    (Object.keys(fitted) as Array<keyof NamespaceLimits>).every(key => (limits?.[key] ?? null) === fitted[key]);
  if (matches(current.resource_limits)) return;
  const { data: updated } = await client.namespaces.update(current.id, { resource_limits: fitted });
  if (updated.slug !== namespace || !matches(updated.resource_limits)) {
    throw new AppError("Cloud resource limits were not confirmed", 502, "CLOUD_RESOURCE_LIMITS_UNCONFIRMED");
  }
}
