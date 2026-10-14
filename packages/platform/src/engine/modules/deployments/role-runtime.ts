/**
 * Binds the pure role rollout (role-rollout.ts) to a real runtime: which deploys
 * may run roles at all, how a replica is started and checked, and how the
 * previous deployment's containers are stopped, restored and retired.
 */

import { reportCaughtError as observeCaughtError } from "@repo/core/diagnostics";
import { safeErrorMessage, type StackRole } from "@repo/core";
import { toStopConfig, type BuildLogger, type DeployConfig, type RuntimeAdapter } from "@repo/adapters";
import type { RoleContainerRef, RoleRolloutDeps } from "./role-rollout";
import { verifyDeployedContainers } from "./stability-audit.service";

const ROLE_RUNTIME_SOURCE = "platform/engine/modules/deployments/role-runtime";

/** Bound for one exec health command. */
const ROLE_HEALTH_TIMEOUT_MS = 30_000;

/** Docker's default stop timeout, for a role that declares no grace period. */
const DEFAULT_STOP_GRACE_S = 10;

/** Same base bound as the rollout's own teardown calls (#629). */
const BASE_TEARDOWN_TIMEOUT_MS = 30_000;

/** Why this deploy cannot run its roles, or null when it can (or declares none). */
export function rolesUnsupportedReason(input: {
  roles: readonly StackRole[] | null | undefined;
  runtime: Pick<RuntimeAdapter, "name" | "supports" | "deployRole">;
  deployMode: string;
  multiService: boolean;
}): string | null {
  const { roles, runtime, deployMode, multiService } = input;
  if (!roles?.length) return null;
  if (multiService) {
    return 'Runtime roles are not supported on multi-service deployments yet. Remove "roles" from openship.json, or deploy the app as a single service.';
  }
  if (deployMode === "static-file-serve") {
    return "Runtime roles need a server image; a static site has no process to run them from.";
  }
  if (!runtime.supports("roles") || !runtime.deployRole) {
    return `Runtime roles are not supported on the "${runtime.name}" runtime yet. Deploy to a Docker server, or remove "roles" from openship.json.`;
  }
  return null;
}

/**
 * Bound for each teardown call of a rollout. Docker's stop waits up to the
 * container's grace period, and a singleton's stop gates the start of its
 * replacement, so a fixed 30s bound would fail every handover of a scheduler
 * with a longer grace period. The bound is 30s plus the longest grace period,
 * never less than Docker's 10s default (the floor also covers no roles at all).
 */
export function roleTeardownTimeoutMs(roles: readonly StackRole[] | null | undefined): number {
  let longestGraceS = DEFAULT_STOP_GRACE_S;
  for (const role of roles ?? []) {
    const graceS =
      toStopConfig({ stopSignal: role.stopSignal, stopGracePeriod: role.stopGracePeriod }).StopTimeout ??
      DEFAULT_STOP_GRACE_S;
    longestGraceS = Math.max(longestGraceS, graceS);
  }
  return BASE_TEARDOWN_TIMEOUT_MS + 1000 * longestGraceS;
}

export function runtimeRoleRolloutDeps(input: {
  roles: readonly StackRole[] | null | undefined;
  previous: readonly RoleContainerRef[] | null | undefined;
  runtime: RuntimeAdapter;
  previousRuntime: RuntimeAdapter;
  config: DeployConfig;
  logger: BuildLogger;
  /** Joins connected networks before a role's process starts (attachLinkedNetworks at the call site). */
  beforeStart: (containerId: string) => Promise<void>;
  stabilizationWindowMs: number;
  signal?: AbortSignal;
  /** Read at failure time, not construction time. */
  keepProvisionedOnCancel: () => boolean;
  /** Injected for tests; defaults to verifyDeployedContainers. */
  verifyStability?: typeof verifyDeployedContainers;
}): RoleRolloutDeps {
  const { roles, runtime, previousRuntime, config, logger } = input;
  const verifyStability = input.verifyStability ?? verifyDeployedContainers;
  const rolesByName = new Map((roles ?? []).map((role) => [role.name, role]));

  return {
    roles,
    previous: input.previous,

    async startReplica(role, replica) {
      const { containerId } = await runtime.deployRole!(config, role, replica, logger.callback, {
        beforeStart: input.beforeStart,
      });
      return containerId;
    },

    async verify(containers) {
      // Roles always get this check, whatever the project's readiness settings:
      // a role has no other "it started" signal, and failing here leaves the
      // previous version running.
      const findings = await verifyStability(
        runtime,
        containers.map((c) => ({ serviceName: `${c.role}-${c.replica}`, containerId: c.containerId })),
        logger,
        {
          windowMs: input.stabilizationWindowMs,
          onUnverified: (detail) => logger.log(`${detail}\n`, "warn"),
        },
      );
      const failed = findings.find((finding) => !finding.verdict.ok);
      if (failed) return failed.detail;

      for (const c of containers) {
        const health = rolesByName.get(c.role)?.health;
        if (health?.kind !== "exec" || !health.command) continue;
        if (!runtime.inContainerExecutor) {
          logger.log(
            `Skipping the health command for role "${c.role}" replica ${c.replica}: this runtime cannot run commands inside a container.\n`,
            "warn",
          );
          continue;
        }
        try {
          const executor = await runtime.inContainerExecutor(c.containerId);
          await executor.exec(health.command, { timeout: ROLE_HEALTH_TIMEOUT_MS });
        } catch (err) {
          observeCaughtError(err, ROLE_RUNTIME_SOURCE);
          return `Role "${c.role}" replica ${c.replica} health command failed: ${safeErrorMessage(err)}`;
        }
      }
      return null;
    },

    async stopPrevious(containerId) {
      try {
        await previousRuntime.stop(containerId);
      } catch (stopErr) {
        // Docker rejects stopping an already-stopped container, and a recorded
        // container may have been removed by hand. Neither may wedge every
        // future deploy: when it is not running, the goal is met.
        let running = true;
        try {
          running = (await previousRuntime.getContainerInfo(containerId)).status === "running";
        } catch {
          // Cannot tell, so the stop failure stands.
        }
        if (running) throw stopErr;
      }
    },

    startPrevious: (containerId) => previousRuntime.start(containerId),
    destroyPrevious: (containerId) => previousRuntime.destroy(containerId),
    destroyStarted: (containerId) => runtime.destroy(containerId),

    log: (message, level) => logger.log(`${message}\n`, level ?? "info"),

    signal: input.signal,
    teardownTimeoutMs: roleTeardownTimeoutMs(roles),
    get keepProvisionedOnCancel() {
      return input.keepProvisionedOnCancel();
    },
  };
}
