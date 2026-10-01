import {
  CloudDockerRuntime,
  SERVER_STATS_COMMAND,
  cloudDockerProjectPaths,
  cloudWorkspaceStatus,
  dockerProjectStorage,
  sq,
  type ResourceConfig,
} from "@repo/adapters";
import { repos } from "@repo/db";
import { AppError, withTimeout } from "@repo/core";
import type { CloudWorkspaceUsage } from "@repo/contracts";
import { requireCloudWorkspace } from "./cloud-workspace-scope";
import { getNamespaceClient } from "./openship-cloud";
import { readCloudWorkspaceAllocation } from "./cloud-capacity";
import { createProvisionLock } from "./provision-lock";
import { cacheStore } from "./cache-store/index";

/** Inspect the persisted host only. A read must never create/resume a VM. */
export async function readCloudWorkspaceHost(organizationId: string, id: string) {
  const owner = await requireCloudWorkspace(organizationId, id);
  const binding = await repos.cloudDockerWorkspace.find({ ownerWorkspaceId: id }, organizationId);
  if (!binding?.workspaceId) return { owner, binding, provider: null };
  if (!owner.namespace || binding.namespace !== owner.namespace)
    throw new AppError("Cloud workspace ownership changed", 409, "CLOUD_NAMESPACE_MISMATCH");
  const provider = await readCloudWorkspaceAllocation(binding.workspaceId, binding.namespace);
  return { owner, binding, provider };
}

export function unavailableWorkspaceUsage(reason: string): CloudWorkspaceUsage {
  return {
    measuredAt: new Date().toISOString(),
    available: false,
    reason,
    cpuPercent: null,
    memoryUsedMb: null,
    memoryAvailableMb: null,
    diskUsedMb: null,
    diskAvailableMb: null,
    diskTotalMb: null,
    sharedDiskMb: null,
    projects: [],
  };
}

async function measuredHost(organizationId: string, id: string) {
  const { owner, binding, provider } = await readCloudWorkspaceHost(organizationId, id);
  if (owner.runtime !== "docker" || !binding?.workspaceId || !provider)
    throw new AppError(
      "The Docker workspace has not been provisioned yet",
      409,
      "CLOUD_WORKSPACE_NOT_READY",
    );
  if (!["running", "active"].includes(cloudWorkspaceStatus(provider.workspace)))
    throw new AppError(
      "The workspace is stopped; saved disk capacity is not a usage measurement",
      409,
      "CLOUD_WORKSPACE_NOT_RUNNING",
    );
  const { client, namespace } = await getNamespaceClient(organizationId, id);
  if (namespace !== binding.namespace) throw new Error("Cloud workspace namespace changed");
  const runtime = await CloudDockerRuntime.forWorkspace(client, {
    workspaceId: binding.workspaceId,
    ownerWorkspaceId: id,
    projectId: `workspace:${id}`,
    namespace,
    provisionLock: createProvisionLock(`cloud:docker:${binding.workspaceId}`),
    bridgeLock: createProvisionLock(`cloud:docker-bridge:${binding.workspaceId}`),
    resolveRegistryAuth: async () => undefined,
  });
  return { runtime, capacity: provider.allocation };
}

async function hostSample(runtime: CloudDockerRuntime) {
  const stats = JSON.parse(
    await runtime.executor.exec(SERVER_STATS_COMMAND, { timeout: 15_000 }),
  ) as Record<string, unknown>;
  for (const field of ["cpu", "memUsed", "memAvail", "diskUsed", "diskAvail", "diskTotal"]) {
    if (
      typeof stats[field] !== "number" ||
      !Number.isFinite(stats[field]) ||
      (stats[field] as number) < 0
    )
      throw new Error("Workspace returned incomplete resource measurements");
  }
  return {
    ...unavailableWorkspaceUsage(""),
    available: true,
    reason: null,
    cpuPercent: stats.cpu as number,
    memoryUsedMb: (stats.memUsed as number) / 1048576,
    memoryAvailableMb: (stats.memAvail as number) / 1048576,
    diskUsedMb: (stats.diskUsed as number) / 1048576,
    diskAvailableMb: (stats.diskAvail as number) / 1048576,
    diskTotalMb: (stats.diskTotal as number) / 1048576,
  };
}

/** Build admission needs only a cheap host sample, never a filesystem scan. */
export async function sampleCloudWorkspaceResources(organizationId: string, id: string) {
  const { runtime, capacity } = await measuredHost(organizationId, id);
  try {
    return { capacity, usage: await hostSample(runtime) };
  } finally {
    await runtime.dispose();
  }
}

/** Internal whole-host reader. Public callers enforce workspace permissions. */
export async function measureCloudWorkspace(
  organizationId: string,
  id: string,
  fresh = false,
): Promise<CloudWorkspaceUsage> {
  const owner = await requireCloudWorkspace(organizationId, id);
  if (owner.runtime !== "docker")
    return unavailableWorkspaceUsage("Live host metrics apply to Docker workspaces.");
  const cache = await cacheStore<CloudWorkspaceUsage>("cloud-workspace-usage", { maxSize: 500 });
  const key = `${organizationId}:${id}`;
  if (!fresh) {
    const hit = await cache.get(key);
    if (hit) return hit;
  }
  const { runtime } = await measuredHost(organizationId, id);
  try {
    const [sample, storage, projects] = await Promise.all([
      hostSample(runtime),
      withTimeout(runtime.docker.df(), 15_000, "Storage inventory timed out").catch(() => null),
      repos.project.listByWorkspace(id, organizationId),
    ]);
    const disk = storage ? dockerProjectStorage(storage, projects) : [];
    const paths = projects.map((project) => cloudDockerProjectPaths(project.id, id).mounts);
    const bindSizes = paths.length
      ? await runtime.executor
          .exec(
            `for p in ${paths.map(sq).join(" ")}; do if [ -d "$p" ]; then du -sk -- "$p"; else printf '0\\n'; fi; done`,
            { timeout: 15_000 },
          )
          .then((raw) => raw.trim().split("\n"))
          .catch(() => [])
      : [];
    const members = [];
    for (const [index, project] of projects.entries()) {
      let bytes = disk.find((item) => item.id === project.id)?.bytes ?? null;
      // Named volumes are in Docker's measurement; repository bind data is not.
      const kb = Number(bindSizes[index]?.trim().split(/\s+/)[0] ?? NaN);
      bytes = bytes !== null && Number.isFinite(kb) && kb >= 0 ? bytes + kb * 1024 : null;
      members.push({
        id: project.id,
        name: project.name,
        diskMb: bytes === null ? null : bytes / 1048576,
      });
    }
    const diskUsedMb = sample.diskUsedMb!;
    const result: CloudWorkspaceUsage = {
      ...sample,
      sharedDiskMb: members.some((item) => item.diskMb === null)
        ? null
        : Math.max(0, diskUsedMb - members.reduce((sum, item) => sum + item.diskMb!, 0)),
      projects: members,
    };
    await cache.set(key, result, 20);
    return result;
  } finally {
    await runtime.dispose();
  }
}

/** Container caps are ceilings, not reserved VMs. A serial build uses currently
 * available memory/CPU inside the purchased host, without allocating another VM. */
export function workspaceBuildResources(
  capacity: ResourceConfig,
  usage: CloudWorkspaceUsage,
  requested?: Partial<ResourceConfig>,
): ResourceConfig {
  if (!usage.available || usage.memoryAvailableMb === null || usage.cpuPercent === null)
    throw new AppError(
      "Couldn't measure the workspace's available build capacity. Retry after the workspace is reachable.",
      503,
      "CLOUD_WORKSPACE_USAGE_UNAVAILABLE",
    );
  const headroomMb = Math.min(512, Math.max(128, capacity.memoryMb * 0.05));
  const availableMb = Math.floor(Math.min(capacity.memoryMb, usage.memoryAvailableMb) - headroomMb);
  if (availableMb < 128)
    throw new AppError(
      "The workspace has too little free memory to build safely. Stop an idle app or upgrade this workspace, then retry.",
      409,
      "CLOUD_WORKSPACE_BUILD_CAPACITY",
    );
  return {
    cpuCores: Math.min(
      requested?.cpuCores || capacity.cpuCores,
      Math.max(
        0.25,
        Math.floor(capacity.cpuCores * (1 - Math.min(100, usage.cpuPercent) / 100) * 4) / 4,
      ),
    ),
    memoryMb: Math.min(requested?.memoryMb || availableMb, availableMb),
    diskMb: capacity.diskMb,
  };
}
