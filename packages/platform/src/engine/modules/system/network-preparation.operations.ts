import { createHash } from "node:crypto";
import {
  AppError,
  MANAGED_NETWORK_PREPARATION_STEPS,
  managedNetworkSteps,
  managedNetworkUnsettled,
  normalizeManagedNetworkInput,
  allocateManagedSubnet,
  validWireGuardEndpoint,
  ClusterConfigError,
  type ManagedNetworkPreparation,
  type ManagedNetworkPreparationHost,
} from "@repo/core";
import type { PlanManagedNetworkInput } from "@repo/contracts";
import { repos, type NetworkPreparationRecord } from "@repo/db";
import { managedNetworkTools } from "@repo/adapters";
import type { ExecutionContext } from "../../../context";
import type { ServerDependencies } from "../../../servers";
import { createProvisionLock } from "../../lib/provision-lock";
import { withServerInventoryLock } from "../../lib/server-inventory-lock";
import { deferBackgroundWork } from "../../lib/background-work";
import { inspectHostIssuedIdentity } from "../../lib/host-port-target";
import {
  assertClusterManagementAvailable,
  authorizeMember,
  onServer,
  eachMember,
  checkError,
  record,
} from "./server-cluster.operations";
import { fleetAdmin, planNetwork } from "./managed-network.operations";
import {
  appendNetworkSetupLog,
  networkSetupMessage,
  updateNetworkSetupStep,
} from "./network-setup-progress";
import { notifyNetworkSetup } from "./network-setup-bus";

export function presentNetworkPreparation(
  row: NetworkPreparationRecord,
): ManagedNetworkPreparation {
  return {
    id: row.id,
    sequence: row.sequence,
    status: row.status,
    input: row.input,
    hosts: row.hosts,
    operationId: row.operationId,
    replacementPreparationId: row.replacementPreparationId ?? null,
    cleanupOperationId: row.cleanupOperationId ?? null,
    error: row.error,
    generation: row.generation,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** No tunnel changes here. Installs finish before allocation and the reviewed apply. */
export async function runNetworkPreparation(
  ctx: ExecutionContext,
  preparation: NetworkPreparationRecord,
) {
  const { id, generation, input } = preparation;
  const hosts = structuredClone(preparation.hosts);
  // Retry probes everything again while retaining the earlier log for diagnosis.
  for (const host of hosts) host.steps = managedNetworkSteps(MANAGED_NETWORK_PREPARATION_STEPS);
  let queue = Promise.resolve();
  let heartbeat = Promise.resolve();
  let dirty = false;
  const cancellation = new AbortController();
  const deadline = AbortSignal.timeout(20 * 60_000);
  const signal = AbortSignal.any([cancellation.signal, deadline]);
  const persist = () => {
    const snapshot = structuredClone(hosts);
    dirty = false;
    queue = queue.then(async () => {
      await repos.networkPreparation.progress(id, generation, snapshot);
      notifyNetworkSetup(ctx.organizationId, "preparation", id);
    });
    return queue;
  };
  const assertActive = async () => {
    if (signal.aborted)
      throw new AppError(
        deadline.aborted
          ? "Server preparation timed out. Check package repository access and retry to continue with the remaining tools."
          : "The controller lost its preparation lease. Reload the saved status before retrying.",
        409,
        "NETWORK_PREPARATION_EXPIRED",
      );
    await fleetAdmin(ctx);
    if (!(await repos.networkPreparation.active(id, generation))) {
      cancellation.abort();
      throw new AppError(
        "This worker no longer owns server preparation. Reload its status before retrying.",
        409,
        "NETWORK_PREPARATION_EXPIRED",
      );
    }
  };
  const step = async (
    host: ManagedNetworkPreparationHost,
    stepId: Parameters<typeof updateNetworkSetupStep>[1],
    status: Parameters<typeof updateNetworkSetupStep>[2],
    message?: string,
  ) => {
    if (status === "running") {
      await assertActive();
      await authorizeMember(ctx, host.serverId);
      const membership = await repos.serverCluster.membership(host.serverId);
      if (membership && membership.clusterId !== input.clusterId)
        throw new AppError(
          "This server joined another cluster while preparation was running. Review its membership before retrying.",
          409,
          "CLUSTER_CONFLICT",
        );
    }
    updateNetworkSetupStep(host, stepId, status, message);
    await persist();
  };
  const logs = setInterval(() => {
    if (dirty) void persist().catch(() => cancellation.abort());
  }, 1000);
  const lease = setInterval(() => {
    heartbeat = heartbeat
      .then(async () => {
        if (!(await repos.networkPreparation.heartbeat(id, generation))) cancellation.abort();
      })
      .catch(() => {
        cancellation.abort();
      });
  }, 20_000);
  logs.unref();
  lease.unref();
  try {
    await assertActive();
    for (const host of hosts) await authorizeMember(ctx, host.serverId);
    await persist();
    // Resolve all physical identities before the first package install.
    await eachMember(
      hosts,
      async (host) => {
        try {
          await step(
            host,
            "connect",
            "running",
            `Preparation attempt ${generation}: checking this server and reusing tools that are already ready.`,
          );
          await onServer(ctx, host.serverId, async (executor) => {
            const identity = await inspectHostIssuedIdentity(executor);
            if (!identity)
              throw new AppError(
                "This server needs a persistent machine identity before setup. Configure /etc/machine-id, then retry.",
                400,
                "NETWORK_HOST_IDENTITY_MISSING",
              );
            if (host.hostIdentity && host.hostIdentity !== identity)
              throw new AppError(
                "The SSH target's physical identity changed. Review this server's connection settings and start a new preparation.",
                409,
                "NETWORK_HOST_CHANGED",
              );
            host.hostIdentity = identity;
          });
          await step(
            host,
            "connect",
            "completed",
            "SSH connection and persistent machine identity verified.",
          );
        } catch (error) {
          await step(host, "connect", "failed", checkError(error).message);
        }
      },
      3,
    );
    const identities = new Set<string>();
    for (const host of hosts)
      if (host.hostIdentity && !host.steps.some((item) => item.status === "failed")) {
        if (identities.has(host.hostIdentity))
          await step(
            host,
            "connect",
            "failed",
            "Two selected server entries point to the same physical host. Select distinct servers.",
          );
        identities.add(host.hostIdentity);
      }
    if (!hosts.some((host) => host.steps.some((item) => item.status === "failed"))) {
      await eachMember(
        hosts,
        async (host) => {
          try {
            await step(
              host,
              "host",
              "running",
              "Waiting for the server provisioning lock before checking and installing tools.",
            );
            await createProvisionLock(`provision:server:${host.serverId}`).run(async () => {
              await assertActive();
              await onServer(ctx, host.serverId, async (executor) => {
                if ((await inspectHostIssuedIdentity(executor)) !== host.hostIdentity)
                  throw new AppError(
                    "The server identity changed before installation. Review its SSH settings.",
                    409,
                    "NETWORK_HOST_CHANGED",
                  );
                await managedNetworkTools.prepareHost(
                  executor,
                  id.replaceAll("-", ""),
                  {
                    step: (key, status, message) => step(host, key, status, message),
                    log: (key, entry) => {
                      appendNetworkSetupLog(host, key, entry);
                      dirty = true;
                    },
                  },
                  signal,
                );
              });
            }, signal);
          } catch (error) {
            if (!host.steps.some((item) => item.status === "failed")) {
              await step(
                host,
                host.steps.find((item) => item.status === "running")?.id ?? "host",
                "failed",
                checkError(error).message,
              );
            }
          }
        },
        2,
      );
    }
    const failures = hosts.filter((host) => host.steps.some((item) => item.status === "failed"));
    if (failures.length)
      throw new AppError(
        `${failures.length} server(s) need attention. Resolve the failed steps below, then retry preparation.`,
        400,
        "NETWORK_PREPARATION_FAILED",
      );
    const operation = await planNetwork(ctx, input, {
      id,
      generation,
      assertActive,
      hostIdentity: (serverId) =>
        hosts.find((host) => host.serverId === serverId)?.hostIdentity ?? null,
      inspection: async (serverId, status, message) => {
        const host = hosts.find((item) => item.serverId === serverId);
        if (host) await step(host, "inspect", status, message);
      },
    });
    // A crash after saving the plan may return it idempotently on retry.
    for (const host of hosts)
      if (host.steps.find((item) => item.id === "inspect")?.status === "pending")
        await step(
          host,
          "inspect",
          "completed",
          "The saved inspection and network plan are ready for review.",
        );
    await persist();
    await repos.networkPreparation.finish(id, generation, hosts, operation.id, null);
    notifyNetworkSetup(ctx.organizationId, "preparation", id);
    record(ctx, operation.clusterId, "network.preparation.ready");
  } catch (error) {
    await queue.catch(() => undefined);
    const message = networkSetupMessage(checkError(error).message);
    for (const host of hosts)
      for (const current of host.steps)
        if (current.status === "running")
          updateNetworkSetupStep(host, current.id, "failed", message);
    await repos.networkPreparation
      .finish(id, generation, hosts, null, message)
      .then(() => notifyNetworkSetup(ctx.organizationId, "preparation", id))
      .catch(() => undefined);
  } finally {
    clearInterval(logs);
    clearInterval(lease);
    cancellation.abort();
    await heartbeat;
    await queue.catch(() => undefined);
  }
}

export const networkPreparationCollection = {
  async prepareManagedNetwork(ctx, input: PlanManagedNetworkInput) {
    await fleetAdmin(ctx);
    if (!input.name.trim())
      throw new AppError(
        "Enter a cluster name before preparing servers.",
        400,
        "INVALID_CLUSTER_CONFIG",
      );
    if (input.cidr) {
      try {
        allocateManagedSubnet([], input.cidr.trim());
      } catch (error) {
        if (error instanceof ClusterConfigError) throw new AppError(error.message, 400, error.code);
        throw error;
      }
    }
    if (input.members.some((member) => member.endpoint && !validWireGuardEndpoint(member.endpoint)))
      throw new AppError(
        "Enter a reachable IPv4 transport address for each server.",
        400,
        "MANAGED_NETWORK_ENDPOINT_REQUIRED",
      );
    if (input.intent === "remove")
      throw new AppError(
        "Removal uses the existing network plan; server preparation is only needed to configure a network.",
        400,
        "INVALID_PREPARATION",
      );
    if (new Set(input.members.map((member) => member.serverId)).size !== input.members.length)
      throw new AppError("Select each server once.", 400, "INVALID_CLUSTER_CONFIG");
    const normalized = normalizeManagedNetworkInput(input);
    const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
    const result = await withServerInventoryLock(ctx.organizationId, async () => {
      await fleetAdmin(ctx);
      const current = input.clusterId
        ? await repos.serverCluster.get(ctx.organizationId, input.clusterId)
        : null;
      if (
        current &&
        (current.network.mode !== "wireguard" ||
          current.revision !== input.revision ||
          (current.operation && managedNetworkUnsettled(current.operation.status)))
      )
        throw new AppError(
          "Reload this cluster and finish its current operation before preparing another change.",
          409,
          "CLUSTER_CONFLICT",
        );
      const ids = [
        ...new Set(
          [...input.members, ...(current?.members ?? [])].map((member) => member.serverId),
        ),
      ].sort();
      const hosts: ManagedNetworkPreparationHost[] = [];
      for (const serverId of ids) {
        const server = await authorizeMember(ctx, serverId);
        const membership = await repos.serverCluster.membership(serverId);
        if (membership && membership.clusterId !== current?.id)
          throw new AppError(
            "A selected server belongs to another cluster or pending operation.",
            409,
            "CLUSTER_CONFLICT",
          );
        hosts.push({
          serverId,
          name: server.name || server.sshHost,
          address: server.sshHost,
          hostIdentity: null,
          steps: managedNetworkSteps(MANAGED_NETWORK_PREPARATION_STEPS),
          logs: [],
        });
      }
      return repos.networkPreparation.start(
        ctx.organizationId,
        ctx.userId,
        hash,
        normalized,
        hosts,
      );
    });
    if (result.started) {
      notifyNetworkSetup(ctx.organizationId, "preparation", result.preparation.id);
      record(ctx, input.clusterId ?? result.preparation.id, "network.preparation.started");
      void deferBackgroundWork(() => runNetworkPreparation(ctx, result.preparation)).catch(
        () => undefined,
      );
    }
    return presentNetworkPreparation(result.preparation);
  },
  async getManagedNetworkPreparation(ctx, input) {
    assertClusterManagementAvailable();
    return presentNetworkPreparation(
      await repos.networkPreparation.get(ctx.organizationId, input.preparationId),
    );
  },
  async discardManagedNetworkPreparation(ctx, input) {
    const result = await withServerInventoryLock(ctx.organizationId, async () => {
      await fleetAdmin(ctx);
      return repos.networkPreparation.discard(
        ctx.organizationId,
        input.preparationId,
        input.sequence,
      );
    });
    notifyNetworkSetup(ctx.organizationId, "preparation", result.preparation!.id);
    if (result.operation) notifyNetworkSetup(ctx.organizationId, "operation", result.operation.id);
    record(ctx, input.preparationId, "network.preparation.discarded");
    return presentNetworkPreparation(result.preparation!);
  },
  async listManagedNetworkPreparations(ctx) {
    assertClusterManagementAvailable();
    return repos.networkPreparation.list(ctx.organizationId);
  },
} satisfies Pick<
  ServerDependencies["collection"],
  | "prepareManagedNetwork"
  | "getManagedNetworkPreparation"
  | "listManagedNetworkPreparations"
  | "discardManagedNetworkPreparation"
>;
